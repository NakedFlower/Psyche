#!/usr/bin/env bash
set -euo pipefail

echo "Large model checkpoints are not downloaded automatically yet."
echo ""
echo "Wav2Lip baseline:"
echo "  1. Run scripts/setup-wav2lip.sh to clone the Wav2Lip source repo."
echo "  2. Place wav2lip_gan.pth at models/wav2lip/checkpoints/wav2lip_gan.pth."
echo "  3. Run sudo scripts/avatar-worker-wav2lip.sh."
