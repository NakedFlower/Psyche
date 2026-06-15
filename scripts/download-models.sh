#!/usr/bin/env bash
set -euo pipefail

echo "Large model checkpoints are not downloaded automatically yet."
echo ""
echo "Wav2Lip baseline:"
echo "  1. Run scripts/setup-wav2lip.sh to clone the Wav2Lip source repo."
echo "  2. Place Wav2Lip-SD-GAN.pt at models/wav2lip/checkpoints/Wav2Lip-SD-GAN.pt."
echo "  3. Run sudo scripts/avatar-worker-wav2lip.sh."
