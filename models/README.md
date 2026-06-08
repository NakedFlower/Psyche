# Models

Model files are not committed to git.

Use this directory on the GPU server for:

- Wav2Lip checkpoints.
- MuseTalk checkpoints.
- Face parsing / VAE / auxiliary model weights.
- Small test assets.

Expected layout:

```txt
models/
  wav2lip/
  musetalk/
  assets/
```

Keep large files out of git. Use `scripts/download-models.sh` to document how
to fetch them.

