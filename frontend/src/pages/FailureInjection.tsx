import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const toxicTypes = [
  { value: "latency", label: "Latency", description: "Add delay to requests" },
  { value: "bandwidth", label: "Bandwidth", description: "Limit throughput" },
  { value: "timeout", label: "Timeout", description: "Simulate timeouts" },
  { value: "slicer", label: "Slicer", description: "Slice TCP packets" },
];

export default function FailureInjection() {
  const queryClient = useQueryClient();
  const [selectedProxy, setSelectedProxy] = useState("");
  const [toxicType, setToxicType] = useState("latency");
  const [toxicValue, setToxicValue] = useState("1000");

  const { data: proxies = [], isLoading } = useQuery({
    queryKey: ['toxics'],
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
      queryClient.invalidateQueries({ queryKey: ['toxics'] });
      toast.success("Toxic added successfully");
      setToxicValue("1000");
    },
    onError: (error: Error) => {
      toast.error(`Failed to add toxic: ${error.message}`);
    },
  });

  const removeToxicMutation = useMutation({
    mutationFn: ({ proxy, toxic }: { proxy: string; toxic: string }) => 
      api.removeToxic(proxy, toxic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['toxics'] });
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

    const toxic = {
      type: toxicType,
      name: `${toxicType}_${Date.now()}`,
      attributes: {
        latency: toxicType === "latency" ? parseInt(toxicValue) : undefined,
        rate: toxicType === "bandwidth" ? parseInt(toxicValue) : undefined,
        timeout: toxicType === "timeout" ? parseInt(toxicValue) : undefined,
      },
    };

    addToxicMutation.mutate({ proxy: selectedProxy, toxic });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Failure Injection</h2>
        <p className="text-muted-foreground mt-1">Chaos engineering with Toxiproxy</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Toxic</CardTitle>
            <CardDescription>Inject failures into your services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="space-y-2">
              <Label htmlFor="type">Toxic Type</Label>
              <Select value={toxicType} onValueChange={setToxicType}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {toxicTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label} - {type.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="value">Value (ms or rate)</Label>
              <Input
                id="value"
                type="number"
                value={toxicValue}
                onChange={(e) => setToxicValue(e.target.value)}
                placeholder="1000"
              />
            </div>

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
                  <div key={proxy.name} className="border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{proxy.name}</h4>
                      <span className={`text-xs px-2 py-1 rounded ${
                        proxy.enabled ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                      }`}>
                        {proxy.enabled ? 'Enabled' : 'Disabled'}
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
                              <span className="text-sm font-medium">{toxic.type}</span>
                              <p className="text-xs text-muted-foreground">
                                {JSON.stringify(toxic.attributes)}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeToxicMutation.mutate({ 
                                proxy: proxy.name, 
                                toxic: toxic.name 
                              })}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No active toxics</p>
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
