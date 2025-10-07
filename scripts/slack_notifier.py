#!/usr/bin/env python3
"""
Slack Notifier - Sends alerts to Slack when metrics exceed thresholds.

Usage:
    python scripts/slack_notifier.py --baseline data/baselines/normal_baseline.yaml
    python scripts/slack_notifier.py --baseline data/baselines/normal_baseline.yaml --config config/alert_thresholds.yaml
"""

import argparse
import yaml
import json
import requests
from pathlib import Path
from datetime import datetime


def load_yaml(filepath):
    """Load YAML file."""
    with open(filepath, 'r') as f:
        return yaml.safe_load(f)


def check_thresholds(baseline_data, thresholds):
    """Check if any metrics exceed thresholds."""
    alerts = []
    
    # Check p95 latency
    p95_ms = baseline_data.get('p95_ms', 0)
    p95_threshold = thresholds.get('latency_p95_ms', 500)
    if p95_ms > p95_threshold:
        alerts.append({
            'severity': 'warning',
            'metric': 'p95_latency',
            'value': p95_ms,
            'threshold': p95_threshold,
            'message': f"p95 latency ({p95_ms:.2f}ms) exceeds threshold ({p95_threshold}ms)"
        })
    
    # Check p50 latency
    p50_ms = baseline_data.get('p50_ms', 0)
    p50_threshold = thresholds.get('latency_p50_ms', 200)
    if p50_ms > p50_threshold:
        alerts.append({
            'severity': 'info',
            'metric': 'p50_latency',
            'value': p50_ms,
            'threshold': p50_threshold,
            'message': f"p50 latency ({p50_ms:.2f}ms) exceeds threshold ({p50_threshold}ms)"
        })
    
    # Check error rate
    error_rate = baseline_data.get('error_rate', 0)
    error_rate_pct = error_rate * 100
    error_threshold = thresholds.get('error_rate_pct', 5)
    if error_rate_pct > error_threshold:
        alerts.append({
            'severity': 'critical',
            'metric': 'error_rate',
            'value': error_rate_pct,
            'threshold': error_threshold,
            'message': f"Error rate ({error_rate_pct:.2f}%) exceeds threshold ({error_threshold}%)"
        })
    
    return alerts


def format_slack_message(alerts, baseline_name):
    """Format alerts as a Slack message payload."""
    if not alerts:
        return {
            "text": "✅ All metrics within acceptable thresholds",
            "attachments": [{
                "color": "good",
                "title": "Performance Check",
                "text": f"Baseline: {baseline_name}",
                "ts": int(datetime.now().timestamp())
            }]
        }
    
    # Determine overall severity
    severities = [a['severity'] for a in alerts]
    if 'critical' in severities:
        color = "danger"
        emoji = "🚨"
    elif 'warning' in severities:
        color = "warning"
        emoji = "⚠️"
    else:
        color = "#439FE0"
        emoji = "ℹ️"
    
    # Build message
    alert_text = "\n".join([f"• {a['message']}" for a in alerts])
    
    return {
        "text": f"{emoji} Performance Alert - {len(alerts)} threshold(s) exceeded",
        "attachments": [{
            "color": color,
            "title": "Alert Details",
            "text": alert_text,
            "fields": [
                {
                    "title": "Baseline",
                    "value": baseline_name,
                    "short": True
                },
                {
                    "title": "Timestamp",
                    "value": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    "short": True
                }
            ],
            "ts": int(datetime.now().timestamp())
        }]
    }


def send_slack_alert(webhook_url, payload):
    """Send alert to Slack webhook."""
    try:
        response = requests.post(
            webhook_url,
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        response.raise_for_status()
        return True, "Alert sent successfully"
    except requests.exceptions.RequestException as e:
        return False, f"Failed to send alert: {str(e)}"


def print_alert_summary(alerts):
    """Print alert summary to stdout."""
    if not alerts:
        print("✅ All metrics within acceptable thresholds")
        return
    
    print(f"\n{'=' * 60}")
    print(f"🚨 ALERT SUMMARY - {len(alerts)} threshold(s) exceeded")
    print(f"{'=' * 60}\n")
    
    for alert in alerts:
        severity_emoji = {
            'critical': '🚨',
            'warning': '⚠️',
            'info': 'ℹ️'
        }.get(alert['severity'], 'ℹ️')
        
        print(f"{severity_emoji} [{alert['severity'].upper()}] {alert['metric']}")
        print(f"   Value: {alert['value']:.2f}")
        print(f"   Threshold: {alert['threshold']:.2f}")
        print(f"   {alert['message']}\n")
    
    print(f"{'=' * 60}\n")


def main():
    parser = argparse.ArgumentParser(description='Send Slack alerts based on metric thresholds')
    parser.add_argument('--baseline', required=True, help='Path to baseline YAML file')
    parser.add_argument('--config', default='config/alert_thresholds.yaml', 
                        help='Path to alert thresholds config (default: config/alert_thresholds.yaml)')
    parser.add_argument('--dry-run', action='store_true', 
                        help='Print alerts without sending to Slack')
    
    args = parser.parse_args()
    
    # Load data
    baseline_data = load_yaml(args.baseline)
    thresholds = load_yaml(args.config)
    
    # Check thresholds
    alerts = check_thresholds(baseline_data, thresholds)
    
    # Print summary
    print_alert_summary(alerts)
    
    # Send to Slack if not dry-run
    if not args.dry_run:
        webhook_url = thresholds.get('slack_webhook_url', 'http://localhost:5000/webhook')
        slack_payload = format_slack_message(alerts, Path(args.baseline).name)
        
        print(f"Sending alert to Slack webhook: {webhook_url}")
        print(f"Payload: {json.dumps(slack_payload, indent=2)}\n")
        
        success, message = send_slack_alert(webhook_url, slack_payload)
        if success:
            print(f"✅ {message}")
        else:
            print(f"❌ {message}")
            exit(1)
    else:
        print("🔍 Dry-run mode: Slack notification skipped")
    
    # Exit with non-zero if there are critical alerts
    critical_alerts = [a for a in alerts if a['severity'] == 'critical']
    if critical_alerts:
        exit(1)


if __name__ == '__main__':
    main()
