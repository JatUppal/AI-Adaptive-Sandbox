#!/usr/bin/env python3
"""
Predict failure risk using trained model.
Takes feature values as JSON and returns risk score + prediction.
"""

import argparse
import json
import sys

import joblib
import numpy as np


def load_model_and_features(model_path, cols_path):
    """Load trained model and feature column order."""
    try:
        model = joblib.load(model_path)
        with open(cols_path, 'r') as f:
            feature_cols = json.load(f)
        return model, feature_cols
    except FileNotFoundError as e:
        print(f"Error: Could not find file - {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error loading model: {e}", file=sys.stderr)
        sys.exit(1)


def parse_row_input(row_str, feature_cols):
    """Parse JSON string of features into ordered array."""
    try:
        row_dict = json.loads(row_str)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON - {e}", file=sys.stderr)
        sys.exit(1)
    
    # Check for missing features
    missing = set(feature_cols) - set(row_dict.keys())
    if missing:
        print(f"Error: Missing required features: {missing}", file=sys.stderr)
        sys.exit(1)
    
    # Extract features in correct order
    features = [row_dict[col] for col in feature_cols]
    return np.array(features).reshape(1, -1)


def predict(model, features):
    """Make prediction and get risk score."""
    # Get probability of failure (class 1)
    risk_score = model.predict_proba(features)[0, 1]
    
    # Get binary prediction
    label_hat = int(model.predict(features)[0])
    
    return risk_score, label_hat


def main():
    parser = argparse.ArgumentParser(description='Predict failure risk')
    parser.add_argument('--model', required=True, help='Path to trained model (.pkl)')
    parser.add_argument('--cols', required=True, help='Path to feature columns JSON')
    parser.add_argument('--row', required=True, help='JSON string with feature values')
    parser.add_argument('--verbose', action='store_true', help='Print verbose output')
    
    args = parser.parse_args()
    
    # Load model and features
    if args.verbose:
        print("Loading model...", file=sys.stderr)
    model, feature_cols = load_model_and_features(args.model, args.cols)
    
    if args.verbose:
        print(f"Feature columns: {feature_cols}", file=sys.stderr)
    
    # Parse input
    if args.verbose:
        print(f"Parsing input: {args.row}", file=sys.stderr)
    features = parse_row_input(args.row, feature_cols)
    
    # Predict
    risk_score, label_hat = predict(model, features)
    
    # Output result as JSON
    result = {
        "risk_score": float(risk_score),
        "label_hat": int(label_hat)
    }
    
    print(json.dumps(result))
    
    return 0


if __name__ == '__main__':
    sys.exit(main())