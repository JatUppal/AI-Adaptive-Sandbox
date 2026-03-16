"""
Pattern matching module for finding similar historical incidents.
Compares current metrics to past incidents using cosine similarity.
"""

import json
import math
from pathlib import Path
from typing import List, Dict, Optional


def load_incidents_database() -> List[Dict]:
    """
    Load historical incidents from data/incidents.json.
    
    Returns:
        List of incident dictionaries, or empty list if file doesn't exist
    """
    incidents_path = Path(__file__).parent.parent / "data" / "incidents.json"
    
    if not incidents_path.exists():
        return []
    
    try:
        with open(incidents_path, 'r') as f:
            incidents = json.load(f)
        return incidents
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error loading incidents database: {e}")
        return []
    
def calculate_cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """
    Calculate cosine similarity between two feature vectors.
    
    Args:
        vec1: First feature vector [error_rate, p95_latency/1000, failed_services_count]
        vec2: Second feature vector with same format
        
    Returns:
        Similarity score between 0.0 (completely different) and 1.0 (identical)
    """
    if len(vec1) != len(vec2):
        return 0.0
    
    # Calculate dot product
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    
    # Calculate magnitudes
    mag1 = math.sqrt(sum(x ** 2 for x in vec1))
    mag2 = math.sqrt(sum(x ** 2 for x in vec2))
    
    # Handle edge case: zero magnitude
    if mag1 == 0 or mag2 == 0:
        return 0.0
    
    # Calculate cosine similarity
    similarity = dot_product / (mag1 * mag2)
    
    return round(similarity, 4)

def format_duration(minutes: int) -> str:
    """
    Format duration in minutes to human-readable string.
    
    Args:
        minutes: Duration in minutes
        
    Returns:
        Formatted string like "45min", "2h 14min", or "1d 3h"
    """
    if minutes < 60:
        return f"{minutes}min"
    elif minutes < 1440:  # Less than 24 hours
        hours = minutes // 60
        remaining_mins = minutes % 60
        if remaining_mins > 0:
            return f"{hours}h {remaining_mins}min"
        return f"{hours}h"
    else:  # Days
        days = minutes // 1440
        remaining_hours = (minutes % 1440) // 60
        if remaining_hours > 0:
            return f"{days}d {remaining_hours}h"
        return f"{days}d"
    
def find_similar_incidents(
    current_metrics: Dict[str, float], 
    threshold: float = 0.5
) -> List[Dict]:
    """
    Find similar historical incidents based on current metrics.
    
    Args:
        current_metrics: Dict with keys: error_rate, p95_latency, failed_services_count
        threshold: Minimum similarity score to include (default 0.5)
        
    Returns:
        List of up to 5 most similar incidents, sorted by similarity (highest first)
    """
    # Load historical incidents
    incidents = load_incidents_database()
    
    if not incidents:
        return []
    
    # Build current feature vector
    # Normalize p95_latency by dividing by 1000 to bring it into similar scale as error_rate
    current_vector = [
        current_metrics.get("error_rate", 0.0),
        current_metrics.get("p95_latency", 0.0) / 1000.0,
        current_metrics.get("failed_services_count", 0)
    ]
    
    # Calculate similarity for each historical incident
    similar_incidents = []
    
    for incident in incidents:
        metrics = incident.get("metrics", {})
        
        # Build incident feature vector
        incident_vector = [
            metrics.get("error_rate", 0.0),
            metrics.get("p95_latency", 0.0) / 1000.0,
            metrics.get("failed_services_count", 0)
        ]
        
        # Calculate similarity
        similarity = calculate_cosine_similarity(current_vector, incident_vector)
        
        # Only include if above threshold
        if similarity >= threshold:
            similar_incidents.append({
                "incident_id": incident.get("incident_id", "unknown"),
                "date": incident.get("date", "unknown"),
                "similarity": similarity,
                "duration": format_duration(incident.get("duration_minutes", 0)),
                "root_cause": incident.get("root_cause", "unknown"),
                "description": incident.get("description", "")
            })
    
    # Sort by similarity (highest first) and take top 5
    similar_incidents.sort(key=lambda x: x["similarity"], reverse=True)
    
    return similar_incidents[:5]