#!/usr/bin/env python3
"""
Dummy W&B training script for testing the W&B Canvas.
Simulates a 3-minute training run with realistic metrics.
"""

import wandb
import random
import math
import time

# Initialize W&B run
run = wandb.init(
    entity="morgymcg",
    project="test",
    name=f"canvas-test-{int(time.time())}",
    config={
        "learning_rate": 0.001,
        "batch_size": 32,
        "epochs": 100,
        "model": "transformer",
        "hidden_dim": 256,
        "num_layers": 4,
    }
)

print(f"Started W&B run: {run.name}")
print(f"Run URL: {run.url}")
print(f"Local dir: {run.dir}")
print("\nLogging metrics for 3 minutes...")

# Simulate training for 3 minutes
start_time = time.time()
duration = 180  # 3 minutes
step = 0

# Initial values
loss = 2.5
accuracy = 0.1
val_loss = 2.8
val_accuracy = 0.08

while time.time() - start_time < duration:
    # Simulate training progress with some noise
    progress = (time.time() - start_time) / duration

    # Loss decreases over time (with noise)
    loss = max(0.01, 2.5 * math.exp(-3 * progress) + random.gauss(0, 0.05))

    # Accuracy increases over time (with noise)
    accuracy = min(0.99, 0.1 + 0.85 * (1 - math.exp(-4 * progress)) + random.gauss(0, 0.02))

    # Validation metrics (slightly worse than training)
    val_loss = loss * 1.2 + random.gauss(0, 0.03)
    val_accuracy = accuracy * 0.95 + random.gauss(0, 0.01)

    # Learning rate with warmup and decay
    if progress < 0.1:
        lr = 0.001 * (progress / 0.1)  # Warmup
    else:
        lr = 0.001 * math.exp(-2 * (progress - 0.1))  # Decay

    # Log metrics
    wandb.log({
        "train/loss": loss,
        "train/accuracy": accuracy,
        "val/loss": val_loss,
        "val/accuracy": val_accuracy,
        "learning_rate": lr,
        "epoch": int(progress * 100),
        "step": step,
        # System-like metrics
        "gpu/utilization": 75 + random.gauss(0, 10),
        "gpu/memory": 8000 + random.gauss(0, 500),
        "throughput": 1000 + random.gauss(0, 100),
    }, step=step)

    # Print progress every 10 steps
    if step % 10 == 0:
        elapsed = time.time() - start_time
        remaining = duration - elapsed
        print(f"Step {step}: loss={loss:.4f}, acc={accuracy:.4f} | {remaining:.0f}s remaining")

    step += 1
    time.sleep(1)  # Log every second

# Final summary
wandb.summary["final_loss"] = loss
wandb.summary["final_accuracy"] = accuracy
wandb.summary["total_steps"] = step

print(f"\nTraining complete!")
print(f"Final loss: {loss:.4f}")
print(f"Final accuracy: {accuracy:.4f}")
print(f"Total steps: {step}")

wandb.finish()
print("\nW&B run finished. Check the dashboard at:", run.url)
