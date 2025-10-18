#!/usr/bin/env python3
"""
Process OTLP capture files and add duration field for baseline generation.
Reads OTLP NDJSON format and outputs spans with duration in nanoseconds.
"""

import json
from pathlib import Path

CAPTURE_IN = Path("data/captures/capture_001.ndjson")
CAPTURE_BACKUP = Path("data/captures/capture_001_otlp.ndjson")
CAPTURE_OUT = Path("data/captures/capture_001.ndjson")

def process_otlp_to_spans(input_file, output_file):
    """Convert OTLP format to individual spans with duration."""
    spans_written = 0
    
    with input_file.open('r') as fin, output_file.open('w') as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            
            try:
                otlp_data = json.loads(line)
            except json.JSONDecodeError:
                continue
            
            # Extract spans from OTLP format
            resource_spans = otlp_data.get('resourceSpans', [])
            for resource_span in resource_spans:
                scope_spans = resource_span.get('scopeSpans', [])
                for scope_span in scope_spans:
                    spans = scope_span.get('spans', [])
                    for span in spans:
                        # Calculate duration from start and end times
                        start_time = int(span.get('startTimeUnixNano', 0))
                        end_time = int(span.get('endTimeUnixNano', 0))
                        duration = end_time - start_time
                        
                        # Create simplified span object with duration
                        processed_span = {
                            'traceId': span.get('traceId'),
                            'spanId': span.get('spanId'),
                            'name': span.get('name'),
                            'duration': duration,  # in nanoseconds
                            'startTimeUnixNano': start_time,
                            'endTimeUnixNano': end_time,
                            'status': span.get('status', {}),
                            'attributes': span.get('attributes', [])
                        }
                        
                        fout.write(json.dumps(processed_span) + '\n')
                        spans_written += 1
    
    return spans_written

if __name__ == '__main__':
    if not CAPTURE_IN.exists():
        print(f"❌ Capture file not found: {CAPTURE_IN}")
        exit(1)
    
    # Backup original OTLP format
    import shutil
    shutil.copy(CAPTURE_IN, CAPTURE_BACKUP)
    
    print(f"Processing {CAPTURE_IN}...")
    count = process_otlp_to_spans(CAPTURE_BACKUP, CAPTURE_IN)
    print(f"✅ Processed {count} spans, updated {CAPTURE_IN}")
