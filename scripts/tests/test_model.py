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


def test_model_with_edge_cases(tmp_path):
    """Test model behavior with edge case inputs."""
    # Create and train a model
    csv_path = create_sample_dataset(tmp_path, n_rows=50)
    df = train_model.load_data(str(csv_path))
    
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    X, y = train_model.prepare_features(df, feature_cols)
    
    model = RandomForestClassifier(n_estimators=10, random_state=42)
    model.fit(X, y)
    
    # Test edge cases
    edge_cases = [
        # All zeros
        '{"req_rate":0.0,"err_rate":0.0,"p50_ms":0.0,"p95_ms":0.0,"toxic_active":0}',
        # Maximum values
        '{"req_rate":1.0,"err_rate":1.0,"p50_ms":5000,"p95_ms":10000,"toxic_active":1}',
        # Very small values
        '{"req_rate":0.001,"err_rate":0.0,"p50_ms":1.0,"p95_ms":5.0,"toxic_active":0}',
    ]
    
    for row_json in edge_cases:
        features = predict_failure.parse_row_input(row_json, feature_cols)
        risk_score, label_hat = predict_failure.predict(model, features)
        
        # Check outputs are valid
        assert 0 <= risk_score <= 1, f"Invalid risk_score: {risk_score}"
        assert label_hat in [0, 1], f"Invalid label: {label_hat}"


def test_missing_features_in_input():
    """Test that missing features are detected."""
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    
    # Missing toxic_active
    incomplete_json = '{"req_rate":0.5,"err_rate":0.2,"p50_ms":150,"p95_ms":600}'
    
    with pytest.raises(SystemExit):
        predict_failure.parse_row_input(incomplete_json, feature_cols)


def test_invalid_json_input():
    """Test that invalid JSON is handled."""
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    
    invalid_json = '{req_rate:0.5,err_rate:0.2}'  # Missing quotes
    
    with pytest.raises(SystemExit):
        predict_failure.parse_row_input(invalid_json, feature_cols)


def test_model_persistence(tmp_path):
    """Test that saved model produces same predictions after loading."""
    csv_path = create_sample_dataset(tmp_path, n_rows=50)
    df = train_model.load_data(str(csv_path))
    
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    X, y = train_model.prepare_features(df, feature_cols)
    
    # Train model
    model = RandomForestClassifier(n_estimators=10, random_state=42)
    model.fit(X, y)
    
    # Get predictions before saving
    predictions_before = model.predict_proba(X[:5])
    
    # Save and reload
    model_path = tmp_path / "test_persistence.pkl"
    joblib.dump(model, str(model_path))
    loaded_model = joblib.load(str(model_path))
    
    # Get predictions after loading
    predictions_after = loaded_model.predict_proba(X[:5])
    
    # Should be identical
    assert np.allclose(predictions_before, predictions_after)


def test_both_models_train(tmp_path):
    """Test that both LogisticRegression and RandomForest can train."""
    csv_path = create_sample_dataset(tmp_path, n_rows=50)
    df = train_model.load_data(str(csv_path))
    
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    X, y = train_model.prepare_features(df, feature_cols)
    
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    # Test LogisticRegression
    from sklearn.linear_model import LogisticRegression
    lr_model = LogisticRegression(solver='liblinear', class_weight='balanced', random_state=42)
    lr_trained, lr_metrics = train_model.train_and_evaluate(
        X_train, X_test, y_train, y_test, lr_model, "LogReg"
    )
    
    assert 'roc_auc' in lr_metrics
    assert lr_metrics['roc_auc'] >= 0.0
    
    # Test RandomForest
    rf_model = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
    rf_trained, rf_metrics = train_model.train_and_evaluate(
        X_train, X_test, y_train, y_test, rf_model, "RF"
    )
    
    assert 'roc_auc' in rf_metrics
    assert rf_metrics['roc_auc'] >= 0.0


def test_model_with_imbalanced_data(tmp_path):
    """Test model training with highly imbalanced classes."""
    np.random.seed(42)
    
    # Create imbalanced dataset (90% class 0, 10% class 1)
    data = {
        'timestamp': pd.date_range('2025-01-01', periods=100, freq='1min'),
        'service': ['service-a'] * 100,
        'req_rate': np.random.uniform(0.1, 1.0, 100),
        'err_rate': np.random.uniform(0.0, 0.5, 100),
        'p50_ms': np.random.uniform(10, 2000, 100),
        'p95_ms': np.random.uniform(50, 3000, 100),
        'toxic_active': np.random.choice([0, 1], 100),
        'label': np.random.choice([0, 1], 100, p=[0.9, 0.1])  # Imbalanced
    }
    
    df = pd.DataFrame(data)
    csv_path = tmp_path / "imbalanced.csv"
    df.to_csv(csv_path, index=False)
    
    # Train with class_weight='balanced'
    df_loaded = train_model.load_data(str(csv_path))
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    X, y = train_model.prepare_features(df_loaded, feature_cols)
    
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    model = RandomForestClassifier(
        n_estimators=50, 
        max_depth=5, 
        class_weight='balanced',  # Should handle imbalance
        random_state=42
    )
    
    trained_model, metrics = train_model.train_and_evaluate(
        X_train, X_test, y_train, y_test, model, "BalancedRF"
    )
    
    # Should still produce valid metrics
    assert 0 <= metrics['roc_auc'] <= 1
    assert metrics['precision'] >= 0
    assert metrics['recall'] >= 0


def test_feature_column_order_matters(tmp_path):
    """Test that feature order is preserved correctly."""
    csv_path = create_sample_dataset(tmp_path, n_rows=50)
    df = train_model.load_data(str(csv_path))
    
    feature_cols = ['req_rate', 'err_rate', 'p50_ms', 'p95_ms', 'toxic_active']
    X, y = train_model.prepare_features(df, feature_cols)
    
    # Train model
    model = RandomForestClassifier(n_estimators=10, random_state=42)
    model.fit(X, y)
    
    # Save columns
    cols_path = tmp_path / "cols_order.json"
    with open(str(cols_path), 'w') as f:
        json.dump(feature_cols, f)
    
    # Load and verify order
    with open(str(cols_path), 'r') as f:
        loaded_cols = json.load(f)
    
    assert loaded_cols == feature_cols
    
    # Test prediction with correct order
    row_dict = {
        'req_rate': 0.5,
        'err_rate': 0.1,
        'p50_ms': 100,
        'p95_ms': 500,
        'toxic_active': 0
    }
    
    # Features should be extracted in the correct order
    features = np.array([row_dict[col] for col in loaded_cols]).reshape(1, -1)
    
    assert features[0, 0] == 0.5   # req_rate
    assert features[0, 1] == 0.1   # err_rate
    assert features[0, 2] == 100   # p50_ms
    assert features[0, 3] == 500   # p95_ms
    assert features[0, 4] == 0     # toxic_active


def test_risk_score_range():
    """Test that risk scores are always between 0 and 1."""
    np.random.seed(42)
    
    # Create synthetic probabilities from a model
    n_samples = 100
    mock_probabilities = np.column_stack([
        np.random.uniform(0, 1, n_samples),
        np.random.uniform(0, 1, n_samples)
    ])
    
    # Normalize to sum to 1 (like real predict_proba output)
    mock_probabilities = mock_probabilities / mock_probabilities.sum(axis=1, keepdims=True)
    
    # Check all risk scores (prob of class 1) are in [0, 1]
    risk_scores = mock_probabilities[:, 1]
    
    assert np.all(risk_scores >= 0)
    assert np.all(risk_scores <= 1)
    assert np.allclose(mock_probabilities.sum(axis=1), 1.0)


def test_dataset_with_nan_rows(tmp_path):
    """Test that NaN rows are properly dropped."""
    np.random.seed(42)
    
    # Create dataset with some NaN values
    data = {
        'timestamp': pd.date_range('2025-01-01', periods=50, freq='1min'),
        'service': ['service-a'] * 50,
        'req_rate': np.random.uniform(0.1, 1.0, 50),
        'err_rate': np.random.uniform(0.0, 0.5, 50),
        'p50_ms': np.random.uniform(10, 2000, 50),
        'p95_ms': np.random.uniform(50, 3000, 50),
        'toxic_active': np.random.choice([0, 1], 50),
        'label': np.random.choice([0, 1], 50)
    }
    
    df = pd.DataFrame(data)
    
    # Add some NaN rows
    df.loc[5:9, 'p50_ms'] = np.nan
    df.loc[15:19, 'p95_ms'] = np.nan
    
    csv_path = tmp_path / "with_nan.csv"
    df.to_csv(csv_path, index=False)
    
    # Load and check NaN handling
    df_loaded = train_model.load_data(str(csv_path))
    
    # Should have dropped 10 rows (5 + 5)
    assert len(df_loaded) == 40
    assert df_loaded.isna().sum().sum() == 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])