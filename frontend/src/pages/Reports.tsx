import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const mockReports = [
  {
    id: 1,
    title: "Weekly System Reliability Report",
    date: "2025-11-01",
    type: "Reliability",
    status: "completed",
    size: "2.4 MB",
  },
  {
    id: 2,
    title: "Monthly Chaos Engineering Summary",
    date: "2025-10-28",
    type: "Chaos Testing",
    status: "completed",
    size: "5.1 MB",
  },
  {
    id: 3,
    title: "AI Model Performance Analysis",
    date: "2025-10-25",
    type: "AI/ML",
    status: "completed",
    size: "1.8 MB",
  },
  {
    id: 4,
    title: "Incident Post-Mortem - Oct 20",
    date: "2025-10-21",
    type: "Incident",
    status: "completed",
    size: "892 KB",
  },
];

const upcomingReports = [
  {
    title: "Quarterly SLA Report",
    scheduledDate: "2025-11-05",
    type: "SLA",
  },
  {
    title: "Cost Optimization Analysis",
    scheduledDate: "2025-11-07",
    type: "Cost",
  },
];

export default function Reports() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
        <p className="text-muted-foreground mt-1">System analytics and documentation</p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockReports.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Available for download</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Scheduled Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingReports.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Auto-generated soon</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Storage Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">10.1 MB</div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Available Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Available Reports</CardTitle>
          <CardDescription>Download historical system reports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockReports.map((report) => (
              <div 
                key={report.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">{report.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{report.date}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <Badge variant="outline" className="text-xs">
                        {report.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {report.size}
                      </span>
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Reports</CardTitle>
          <CardDescription>Automatically generated reports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {upcomingReports.map((report, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-4 border border-border rounded-lg bg-secondary/30"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-muted rounded-lg">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h4 className="font-medium text-muted-foreground">{report.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Scheduled for {report.scheduledDate}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <Badge variant="outline" className="text-xs">
                        {report.type}
                      </Badge>
                    </div>
                  </div>
                </div>
                <Badge variant="secondary">Pending</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
