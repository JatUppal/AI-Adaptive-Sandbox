import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Activity, PlayCircle, AlertTriangle, Brain, FileText } from "lucide-react";

const navItems = [
  { path: "/", label: "Dashboard", icon: Activity },
  { path: "/replay", label: "Replay", icon: PlayCircle },
  { path: "/failure", label: "Failure Injection", icon: AlertTriangle },
  { path: "/ai", label: "AI Insights", icon: Brain },
  { path: "/reports", label: "Reports", icon: FileText },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-sidebar-border">
        <div className="p-6">
          <h1 className="text-xl font-bold text-sidebar-primary flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Control Plane
          </h1>
          <p className="text-xs text-muted-foreground mt-1">AI Adaptive Sandbox</p>
        </div>
        
        <nav className="px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="p-3 bg-sidebar-accent rounded-md">
            <div className="flex items-center gap-2 text-xs">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-muted-foreground">System Online</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
