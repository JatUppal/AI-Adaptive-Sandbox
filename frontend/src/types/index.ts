// Prediction types
export interface AffectedService {
  service_name: string;
  failure_probability: number;
  reason: string;
}

export interface PredictionResponse {
  predicted_failure_probability: number;
  affected_services: AffectedService[];
  recommendation: string;
}

// Analysis types
export interface RootCause {
  rank: number;
  service: string;
  issue: string;
  confidence: number;
  evidence: string;
  trace_ids: string[];
  details: {
    error_message: string;
    affected_span: string;
    avg_duration_ms: number;
  };
}

export interface AnalysisResponse {
  test_id: string;
  project_name: string;             
  analyzed_services: string[];      
  status: "success" | "failed";
  error_rate: number;
  total_traces: number;
  failed_traces: number;
  root_causes: RootCause[];
  ai_summary: string;                
  recommendations: string[];         
}

// Pattern matching types
export interface SimilarIncident {
  incident_id: string;
  date: string;
  similarity: number;
  duration: string;
  root_cause: string;
  description: string;
}

// Reports types
export interface Report {
  filename: string;
  created_at: string;
  size_mb: number;
  download_url: string;
}