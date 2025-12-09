#!/usr/bin/env python3
"""
Train a failure prediction model from metrics dataset.
Tries LogisticRegression and RandomForestClassifier, picks best by ROC AUC.
"""

import argparse
import json
import sys
from pathlib import Path

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score
import joblib


def load_data(csv_path):
    """Load dataset and drop rows with NaN values."""
    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} rows from {csv_path}")
    
    # Drop rows with NaN
    df_clean = df.dropna()
    print(f"After dropping NaN: {len(df_clean)} rows")
    
    if len(df_clean) == 0:
        raise ValueError("No valid data after dropping NaN rows!")
    
    return df_clean


def prepare_features(df, feature_cols):
    """Extract features and labels."""
    X = df[feature_cols].values
    y = df['label'].values
    
    print(f"\nFeature matrix shape: {X.shape}")
    print(f"Label distribution:")
    unique, counts = np.unique(y, return_counts=True)
    for label, count in zip(unique, counts):
        print(f"  Label {label}: {count} ({count/len(y)*100:.1f}%)")
    
    return X, y


def train_and_evaluate(X_train, X_test, y_train, y_test, model, model_name):
    """Train a model and return evaluation metrics."""
    print(f"\n{'='*50}")
    print(f"Training: {model_name}")
    print(f"{'='*50}")
    
    # Train
    model.fit(X_train, y_train)
    
    # Predict
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]
    
    # Calculate metrics
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    roc_auc = roc_auc_score(y_test, y_proba)
    
    metrics = {
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'roc_auc': roc_auc
    }
    
    # Print results
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1 Score:  {f1:.4f}")
    print(f"ROC AUC:   {roc_auc:.4f}")
    
    return model, metrics


def main():
    parser = argparse.ArgumentParser(description='Train failure prediction model')
    parser.add_argument('--data', required=True, help='Path to CSV dataset')
    parser.add_argument('--model-out', required=True, help='Path to save trained model')
    parser.add_argument('--cols-out', required=True, help='Path to save feature columns JSON')
    parser.add_argument('--test-size', type=float, default=0.2, help='Test split ratio (default: 0.2)')
    parser.add_argument('--random-seed', type=int, default=42, help='Random seed for reproducibility')
    
    args = parser.parse_args()
    
    # Feature columns (must match dataset)
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    
    # Load data
    print("="*60)
    print("STEP 1: Loading Data")
    print("="*60)
    df = load_data(args.data)
    
    # Check if we have required columns
    missing_cols = set(feature_cols + ['label']) - set(df.columns)
    if missing_cols:
        raise ValueError(f"Missing columns in dataset: {missing_cols}")
    
    # Prepare features
    X, y = prepare_features(df, feature_cols)
    
    # Check if we have enough data
    if len(X) < 10:
        raise ValueError(f"Not enough data to train! Need at least 10 rows, have {len(X)}")
    
    # Split data
    print("\n" + "="*60)
    print("STEP 2: Splitting Data")
    print("="*60)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.random_seed, shuffle=True, stratify=y
    )
    print(f"Train set: {len(X_train)} rows")
    print(f"Test set:  {len(X_test)} rows")
    
    # Train models
    print("\n" + "="*60)
    print("STEP 3: Training Models")
    print("="*60)
    
    models = [
        (LogisticRegression(solver='liblinear', class_weight='balanced', random_state=args.random_seed, max_iter=1000),
         "LogisticRegression"),
        (RandomForestClassifier(n_estimators=200, max_depth=8, random_state=args.random_seed, class_weight='balanced'),
         "RandomForestClassifier")
    ]
    
    results = []
    for model, name in models:
        trained_model, metrics = train_and_evaluate(X_train, X_test, y_train, y_test, model, name)
        results.append((trained_model, name, metrics))
    
    # Select best model by ROC AUC
    print("\n" + "="*60)
    print("STEP 4: Selecting Best Model")
    print("="*60)
    best_model, best_name, best_metrics = max(results, key=lambda x: x[2]['roc_auc'])
    
    print(f"\n🏆 Best Model: {best_name}")
    print(f"   ROC AUC: {best_metrics['roc_auc']:.4f}")
    
    # Save model
    print("\n" + "="*60)
    print("STEP 5: Saving Model")
    print("="*60)
    
    # Create output directory if needed
    Path(args.model_out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.cols_out).parent.mkdir(parents=True, exist_ok=True)
    
    # Save model
    joblib.dump(best_model, args.model_out)
    print(f"✅ Model saved to: {args.model_out}")
    
    # Save feature columns
    with open(args.cols_out, 'w') as f:
        json.dump(feature_cols, f, indent=2)
    print(f"✅ Feature columns saved to: {args.cols_out}")
    
    # Final summary
    print("\n" + "="*60)
    print("TRAINING COMPLETE!")
    print("="*60)
    print(f"Best Model: {best_name}")
    print(f"ROC AUC:    {best_metrics['roc_auc']:.4f}")
    print(f"Precision:  {best_metrics['precision']:.4f}")
    print(f"Recall:     {best_metrics['recall']:.4f}")
    print(f"F1 Score:   {best_metrics['f1']:.4f}")
    
    if best_metrics['roc_auc'] >= 0.75:
        print("\n✅ SUCCESS: ROC AUC ≥ 0.75 requirement met!")
    else:
        print(f"\n⚠️  WARNING: ROC AUC {best_metrics['roc_auc']:.4f} is below 0.75 target")
        print("   Consider collecting more data or adjusting features")
    
    return 0 if best_metrics['roc_auc'] >= 0.75 else 1


if __name__ == '__main__':
    sys.exit(main())