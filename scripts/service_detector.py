"""
Auto-detect services from docker-compose files.
Makes the system work with ANY user's microservices.
"""

import yaml
from pathlib import Path
from typing import List, Dict


def parse_docker_compose(compose_file: str) -> Dict:
    """
    Parse user's docker-compose.yml to extract services.
    
    Args:
        compose_file: Path to docker-compose.yml
        
    Returns:
        Dict with service names, ports, dependencies
    """
    with open(compose_file, 'r') as f:
        compose = yaml.safe_load(f)
    
    services = {}
    
    for service_name, config in compose.get('services', {}).items():
        # Skip infrastructure services
        if service_name in ['jaeger', 'prometheus', 'toxiproxy', 'grafana']:
            continue
        
        services[service_name] = {
            'name': service_name,
            'ports': config.get('ports', []),
            'depends_on': config.get('depends_on', []),
            'environment': config.get('environment', {}),
            'has_tracing': 'JAEGER' in str(config.get('environment', {}))
        }
    
    return services


def generate_service_config(docker_compose_path: str) -> Dict:
    """
    Generate RCA configuration from user's docker-compose.
    
    This allows users to upload their own services!
    """
    services = parse_docker_compose(docker_compose_path)
    
    config = {
        'project_name': Path(docker_compose_path).parent.name,
        'services': list(services.keys()),
        'service_details': services,
        'total_services': len(services),
        'tracing_enabled': sum(1 for s in services.values() if s['has_tracing'])
    }
    
    return config


def validate_tracing_setup(services: Dict) -> List[str]:
    """
    Check if services have OpenTelemetry configured.
    
    Returns list of warnings for services missing tracing.
    """
    warnings = []
    
    for name, config in services.items():
        if not config['has_tracing']:
            warnings.append(
                f"⚠️  {name}: Missing OpenTelemetry setup. Add JAEGER_ENDPOINT to environment."
            )
    
    return warnings