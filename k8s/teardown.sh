#!/bin/bash
# Prometheon — destroy the kind cluster
echo "Deleting kind cluster 'prometheon'..."
kind delete cluster --name prometheon
echo "Done. All resources destroyed."