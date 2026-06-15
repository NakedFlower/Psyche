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
  README.md
  wav2lip/
    checkpoints/
      Wav2Lip-SD-GAN.pt
      wav2lip_gan.pth
    repos/
      Wav2Lip/
  musetalk/
    checkpoints/
    repos/
  assets/
    face.png
    speech.wav
```

Keep large files out of git. Use `scripts/download-models.sh` to document how
to fetch them.
