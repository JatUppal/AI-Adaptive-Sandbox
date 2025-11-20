#!/usr/bin/env python3
"""
Train a failure prediction model from metrics dataset.

Usage:
    python scripts/train_model.py \
      --data data/phase2/metrics_dataset.csv \
      --model-out models/failure_predictor.pkl \
      --cols-out models/feature_columns.json
"""
import argparse
import pandas as pd
import numpy as np
import json
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score, confusion_matrix
import sys


def train_model(data_path: str, model_out: str, cols_out: str):
    """Train a failure prediction model."""
    print(f"Loading dataset from {data_path}...")
    
    try:
        df = pd.read_csv(data_path)
    except FileNotFoundError:
        print(f"Error: Dataset not found at {data_path}")
        print("Run build_dataset.py first to create the dataset.")
        sys.exit(1)
    
    print(f"Dataset shape: {df.shape}")
    
    # Define features
    feature_cols = ["req_rate", "err_rate", "p50_ms", "p95_ms", "toxic_active"]
    
    # Check if all features exist
    missing = [col for col in feature_cols if col not in df.columns]
    if missing:
        print(f"Error: Missing features in dataset: {missing}")
        sys.exit(1)
    
    if "failure" not in df.columns:
        print("Error: 'failure' label column not found in dataset")
        sys.exit(1)
    
    # Prepare data
    X = df[feature_cols].values
    y = df["failure"].values
    
    print(f"\nFeatures: {feature_cols}")
    print(f"Samples: {len(X)}")
    print(f"Failure rate: {y.mean()*100:.1f}%")
    
    # Check if we have enough data
    if len(X) < 10:
        print("\nWarning: Very few samples. Model may not be reliable.")
        print("Generate more load and metrics before training.")
    
    # Check class balance
    failure_count = y.sum()
    if failure_count == 0:
        print("\nWarning: No failure samples in dataset!")
        print("The model will not learn to predict failures.")
        print("Try injecting failures with Toxiproxy and regenerating the dataset.")
    elif failure_count == len(y):
        print("\nWarning: All samples are failures!")
        print("Generate some normal traffic for a balanced dataset.")
    
    # Split data
    if len(X) >= 20:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y if failure_count > 0 and failure_count < len(y) else None
        )
    else:
        # Too few samples, use all for training
        X_train, X_test, y_train, y_test = X, X, y, y
        print("\nNote: Using all data for both training and testing (dataset too small)")
    
    print(f"\nTrain samples: {len(X_train)}, Test samples: {len(X_test)}")
    
    # Train model
    print("\nTraining Random Forest classifier...")
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=5,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        class_weight="balanced"  # Handle class imbalance
    )
    
    model.fit(X_train, y_train)
    
    # Evaluate
    print("\n" + "="*60)
    print("MODEL EVALUATION")
    print("="*60)
    
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]
    
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["Normal", "Failure"], zero_division=0))
    
    print("\nConfusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(f"  True Negatives:  {cm[0,0] if cm.shape[0] > 1 else 0}")
    print(f"  False Positives: {cm[0,1] if cm.shape[0] > 1 else 0}")
    print(f"  False Negatives: {cm[1,0] if cm.shape[0] > 1 else 0}")
    print(f"  True Positives:  {cm[1,1] if cm.shape[0] > 1 else 0}")
    
    if len(np.unique(y_test)) > 1:
        auc = roc_auc_score(y_test, y_proba)
        print(f"\nROC AUC Score: {auc:.3f}")
    else:
        print("\nROC AUC: N/A (only one class in test set)")
    
    # Feature importance
    print("\nFeature Importance:")
    for feat, imp in zip(feature_cols, model.feature_importances_):
        print(f"  {feat:15s}: {imp:.3f}")
    
    # Save model
    print(f"\n{'='*60}")
    print("SAVING MODEL")
    print("="*60)
    
    import os
    os.makedirs(os.path.dirname(model_out), exist_ok=True)
    os.makedirs(os.path.dirname(cols_out), exist_ok=True)
    
    joblib.dump(model, model_out)
    print(f"✓ Model saved to {model_out}")
    
    with open(cols_out, "w") as f:
        json.dump(feature_cols, f, indent=2)
    print(f"✓ Feature columns saved to {cols_out}")
    
    print("\n✓ Training complete!")
    print("\nNext steps:")
    print("  1. Start the ai-predictor service")
    print("  2. Call /predict to get risk scores")
    print("  3. View /metrics to see failure_risk_score")
    print("  4. Add Grafana panels to visualize the risk")


def main():
    parser = argparse.ArgumentParser(description="Train failure prediction model")
    parser.add_argument("--data", type=str, required=True, help="Input CSV dataset path")
    parser.add_argument("--model-out", type=str, default="models/failure_predictor.pkl", help="Output model path")
    parser.add_argument("--cols-out", type=str, default="models/feature_columns.json", help="Output feature columns JSON")
    
    args = parser.parse_args()
    
    train_model(args.data, args.model_out, args.cols_out)


if __name__ == "__main__":
    main()
