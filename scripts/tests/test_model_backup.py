#!/usr/bin/env python3
"""
Unit tests for model training and prediction.
"""

import os
import json
import tempfile
from pathlib import Path

import pytest
import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier

# Import our training script
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
import train_model
import predict_failure


def create_sample_dataset(tmp_path, n_rows=50):
    """Create a small synthetic dataset for testing."""
    np.random.seed(42)
    
    # Generate features
    data = {
        'timestamp': pd.date_range('2025-01-01', periods=n_rows, freq='1min'),
        'service': ['service-a'] * n_rows,
        'req_rate': np.random.uniform(0.1, 1.0, n_rows),
        'err_rate': np.random.uniform(0.0, 0.5, n_rows),
        'p50_ms': np.random.uniform(10, 2000, n_rows),
        'p95_ms': np.random.uniform(50, 3000, n_rows),
        'toxic_active': np.random.choice([0, 1], n_rows),
        'label': np.random.choice([0, 1], n_rows, p=[0.6, 0.4])
    }
    
    df = pd.DataFrame(data)
    csv_path = tmp_path / "test_dataset.csv"
    df.to_csv(csv_path, index=False)
    
    return csv_path


def test_load_data(tmp_path):
    """Test data loading and NaN handling."""
    csv_path = create_sample_dataset(tmp_path, n_rows=30)
    
    df = train_model.load_data(str(csv_path))
    
    assert len(df) > 0
    assert 'label' in df.columns
    assert df.isna().sum().sum() == 0  # No NaN values


def test_prepare_features(tmp_path):
    """Test feature extraction."""
    csv_path = create_sample_dataset(tmp_path, n_rows=30)
    df = train_model.load_data(str(csv_path))
    
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    X, y = train_model.prepare_features(df, feature_cols)
    
    assert X.shape[0] == len(df)
    assert X.shape[1] == len(feature_cols)
    assert len(y) == len(df)
    assert set(np.unique(y)).issubset({0, 1})


def test_train_model_end_to_end(tmp_path):
    """Test full training pipeline."""
    # Create dataset
    csv_path = create_sample_dataset(tmp_path, n_rows=50)
    
    # Output paths
    model_path = tmp_path / "test_model.pkl"
    cols_path = tmp_path / "test_cols.json"
    
    # Load and prepare data
    df = train_model.load_data(str(csv_path))
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    X, y = train_model.prepare_features(df, feature_cols)
    
    # Train a simple model
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, shuffle=True
    )
    
    model = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
    trained_model, metrics = train_model.train_and_evaluate(
        X_train, X_test, y_train, y_test, model, "TestModel"
    )
    
    # Save model
    joblib.dump(trained_model, str(model_path))
    with open(str(cols_path), 'w') as f:
        json.dump(feature_cols, f)
    
    # Check files exist
    assert model_path.exists()
    assert cols_path.exists()
    
    # Check metrics
    assert 'roc_auc' in metrics
    assert 0 <= metrics['roc_auc'] <= 1


def test_predict_proba_works(tmp_path):
    """Test that model can make probability predictions."""
    csv_path = create_sample_dataset(tmp_path, n_rows=50)
    df = train_model.load_data(str(csv_path))
    
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    X, y = train_model.prepare_features(df, feature_cols)
    
    # Train simple model
    model = RandomForestClassifier(n_estimators=10, max_depth=3, random_state=42)
    model.fit(X, y)
    
    # Test predict_proba
    proba = model.predict_proba(X[:5])
    
    assert proba.shape == (5, 2)  # 5 samples, 2 classes
    assert np.allclose(proba.sum(axis=1), 1.0)  # Probabilities sum to 1
    assert np.all(proba >= 0) and np.all(proba <= 1)  # Valid probabilities


def test_prediction_script(tmp_path):
    """Test the prediction script."""
    # Create and train a model
    csv_path = create_sample_dataset(tmp_path, n_rows=50)
    df = train_model.load_data(str(csv_path))
    
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    X, y = train_model.prepare_features(df, feature_cols)
    
    model = RandomForestClassifier(n_estimators=10, random_state=42)
    model.fit(X, y)
    
    # Save model and columns
    model_path = tmp_path / "model.pkl"
    cols_path = tmp_path / "cols.json"
    
    joblib.dump(model, str(model_path))
    with open(str(cols_path), 'w') as f:
        json.dump(feature_cols, f)
    
    # Load and predict
    loaded_model, loaded_cols = predict_failure.load_model_and_features(
        str(model_path), str(cols_path)
    )
    
    # Test prediction
    row_json = '{"req_rate":0.5,"err_rate":0.1,"p50_ms":100,"p95_ms":500,"toxic_active":0}'
    features = predict_failure.parse_row_input(row_json, loaded_cols)
    risk_score, label_hat = predict_failure.predict(loaded_model, features)
    
    assert 0 <= risk_score <= 1
    assert label_hat in [0, 1]


def test_parse_row_input():
    """Test JSON parsing for predictions."""
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    row_json = '{"req_rate":0.5,"err_rate":0.2,"p50_ms":150,"p95_ms":600,"toxic_active":1}'
    
    features = predict_failure.parse_row_input(row_json, feature_cols)
    
    assert features.shape == (1, 5)
    assert features[0, 0] == 0.5  # req_rate
    assert features[0, 4] == 1    # toxic_active


if __name__ == '__main__':
    pytest.main([__file__, '-v'])