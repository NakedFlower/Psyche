# Model Comparison

## Wav2Lip

Pros:

- Good first baseline.
- Known lip-sync model.
- Easier to reason about than larger diffusion-based systems.

Risks:

- Face motion can feel limited.
- Quality may not match Tavus.

## MuseTalk

Pros:

- Designed for high-quality realtime lip synchronization.
- Better candidate for a custom avatar engine.

Risks:

- More moving parts.
- Requires careful GPU and streaming optimization.

## SadTalker

Pros:

- Useful for talking-head quality comparison.

Risks:

- Less attractive for low-latency realtime calls.

## Decision Rule

Start with Wav2Lip for a working baseline, then test MuseTalk on A100.

