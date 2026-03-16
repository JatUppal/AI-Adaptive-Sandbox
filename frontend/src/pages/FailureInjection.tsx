import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Toxic type definitions — only types relevant to HTTP microservices
// ---------------------------------------------------------------------------
interface ToxicTypeDef {
  value: string;
  label: string;
  description: string;
  fields: FieldDef[];
}

interface FieldDef {
  key: string;        // Toxiproxy attribute name
  label: string;
  placeholder: string;
  defaultValue: number;
  unit: string;
  min?: number;
}

const toxicTypes: ToxicTypeDef[] = [
  {
    value: "latency",
    label: "Latency",
    description: "Add delay to all data through the proxy",
    fields: [
      { key: "latency", label: "Latency", placeholder: "1000", defaultValue: 1000, unit: "ms", min: 0 },
      { key: "jitter", label: "Jitter", placeholder: "0", defaultValue: 0, unit: "ms (±)", min: 0 },
    ],
  },
  {
    value: "timeout",
    label: "Timeout",
    description: "Stop forwarding data and close connection after delay",
    fields: [
      { key: "timeout", label: "Timeout", placeholder: "5000", defaultValue: 5000, unit: "ms", min: 0 },
    ],
  },
  {
    value: "limit_data",
    label: "Limit Data",
    description: "Close connection after sending N bytes (0 = instant cut)",
    fields: [
      { key: "bytes", label: "Bytes allowed", placeholder: "0", defaultValue: 0, unit: "bytes", min: 0 },
    ],
  },
  {
    value: "reset_peer",
    label: "Reset Peer",
    description: "Reset TCP connection after timeout (simulates crash)",
    fields: [
      { key: "timeout", label: "Delay before reset", placeholder: "0", defaultValue: 0, unit: "ms", min: 0 },
    ],
  },
  {
    value: "bandwidth",
    label: "Bandwidth",
    description: "Limit data throughput through the proxy",
    fields: [
      { key: "rate", label: "Rate", placeholder: "10", defaultValue: 10, unit: "KB/s", min: 1 },
    ],
  },
];

export default function FailureInjection() {
  const queryClient = useQueryClient();
  const [selectedProxy, setSelectedProxy] = useState("");
  const [toxicType, setToxicType] = useState("latency");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Get the active type definition
  const activeDef = toxicTypes.find((t) => t.value === toxicType)!;

  // Get field value (use default if not set)
  const getFieldValue = (field: FieldDef) =>
    fieldValues[field.key] ?? String(field.defaultValue);

  const setField = (key: string, value: string) =>
    setFieldValues((prev) => ({ ...prev, [key]: value }));

  // Reset field values when toxic type changes
  const handleTypeChange = (newType: string) => {
    setToxicType(newType);
    setFieldValues({});
  };

  const { data: proxies = [], isLoading } = useQuery({
    queryKey: ["toxics"],
    queryFn: async () => {
      const result = await api.listToxics();
      return Array.isArray(result) ? result : [];
    },
    refetchInterval: 5000,
  });

  const addToxicMutation = useMutation({
    mutationFn: ({ proxy, toxic }: { proxy: string; toxic: any }) =>
      api.addToxic(proxy, toxic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["toxics"] });
      toast.success("Toxic added successfully");
      setFieldValues({});
    },
    onError: (error: Error) => {
      toast.error(`Failed to add toxic: ${error.message}`);
    },
  });

  const removeToxicMutation = useMutation({
    mutationFn: ({ proxy, toxic }: { proxy: string; toxic: string }) =>
      api.removeToxic(proxy, toxic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["toxics"] });
      toast.success("Toxic removed successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove toxic: ${error.message}`);
    },
  });

  const handleAddToxic = () => {
    if (!selectedProxy) {
      toast.error("Please select a proxy");
      return;
    }

    // Build attributes from field definitions
    const attributes: Record<string, number> = {};
    for (const field of activeDef.fields) {
      const raw = getFieldValue(field);
      const n = parseInt(raw, 10);
      attributes[field.key] = Number.isFinite(n) ? n : field.defaultValue;
    }

    const toxic = {
      type: toxicType,
      name: `${toxicType}_${Date.now()}`,
      attributes,
    };

    addToxicMutation.mutate({ proxy: selectedProxy, toxic });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Failure Injection</h2>
        <p className="text-muted-foreground mt-1">
          Chaos engineering with Toxiproxy
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ---- Left: Add Toxic Form ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Add Toxic</CardTitle>
            <CardDescription>Inject failures into your services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Proxy selector */}
            <div className="space-y-2">
              <Label htmlFor="proxy">Target Proxy</Label>
              <Select value={selectedProxy} onValueChange={setSelectedProxy}>
                <SelectTrigger id="proxy">
                  <SelectValue placeholder="Select a proxy" />
                </SelectTrigger>
                <SelectContent>
                  {proxies?.map((proxy: any) => (
                    <SelectItem key={proxy.name} value={proxy.name}>
                      {proxy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Toxic type selector */}
            <div className="space-y-2">
              <Label htmlFor="type">Toxic Type</Label>
              <Select value={toxicType} onValueChange={handleTypeChange}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {toxicTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label} — {type.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic fields based on selected toxic type */}
            {activeDef.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>
                  {field.label}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({field.unit})
                  </span>
                </Label>
                <Input
                  id={field.key}
                  type="number"
                  value={getFieldValue(field)}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  min={field.min}
                />
              </div>
            ))}

            {/* Hint for the selected type */}
            <p className="text-xs text-muted-foreground">
              {toxicType === "latency" &&
                "Adds fixed delay ± jitter to every request through the proxy. Values above 5000ms will exceed service-a's httpx timeout and cause 502s."}
              {toxicType === "timeout" &&
                "Stops forwarding data after the timeout. The downstream connection hangs until the client times out."}
              {toxicType === "limit_data" &&
                "Closes the connection after N bytes are sent. Set to 0 for an instant connection cut — the most reliable way to produce 502 errors."}
              {toxicType === "reset_peer" &&
                "Sends a TCP RST after the delay, simulating a crashed or restarting service."}
              {toxicType === "bandwidth" &&
                "Throttles data throughput. Low rates (1-5 KB/s) can cause timeouts on larger responses."}
            </p>

            <Button
              onClick={handleAddToxic}
              disabled={addToxicMutation.isPending}
              className="w-full"
              variant="destructive"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Toxic
            </Button>
          </CardContent>
        </Card>

        {/* ---- Right: Active Toxics ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Active Toxics</CardTitle>
            <CardDescription>Currently injected failures</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="text-center py-8 text-muted-foreground">
                Loading...
              </div>
            )}

            {!isLoading && (!proxies || proxies.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No proxies found</p>
                <p className="text-sm mt-1">Make sure Toxiproxy is running</p>
              </div>
            )}

            {!isLoading && proxies && proxies.length > 0 && (
              <div className="space-y-4">
                {proxies.map((proxy: any) => (
                  <div
                    key={proxy.name}
                    className="border border-border rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{proxy.name}</h4>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          proxy.enabled
                            ? "bg-success/20 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {proxy.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {proxy.listen} → {proxy.upstream}
                    </p>

                    {proxy.toxics && proxy.toxics.length > 0 ? (
                      <div className="space-y-2">
                        {proxy.toxics.map((toxic: any) => (
                          <div
                            key={toxic.name}
                            className="flex items-center justify-between p-2 bg-secondary rounded"
                          >
                            <div>
                              <span className="text-sm font-medium">
                                {toxic.type}
                              </span>
                              <p className="text-xs text-muted-foreground font-mono">
                                {formatAttributes(toxic.type, toxic.attributes)}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                removeToxicMutation.mutate({
                                  proxy: proxy.name,
                                  toxic: toxic.name,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No active toxics
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format active toxic attributes into a human-readable string
// ---------------------------------------------------------------------------
function formatAttributes(type: string, attrs: Record<string, any>): string {
  if (!attrs) return "";

  switch (type) {
    case "latency":
      return `${attrs.latency ?? 0}ms latency, ±${attrs.jitter ?? 0}ms jitter`;
    case "timeout":
      return `${attrs.timeout ?? 0}ms timeout`;
    case "limit_data":
      return attrs.bytes === 0
        ? "instant connection cut (0 bytes)"
        : `close after ${attrs.bytes} bytes`;
    case "reset_peer":
      return attrs.timeout === 0
        ? "immediate TCP reset"
        : `TCP reset after ${attrs.timeout}ms`;
    case "bandwidth":
      return `${attrs.rate ?? 0} KB/s`;
    default:
      return JSON.stringify(attrs);
  }
}
