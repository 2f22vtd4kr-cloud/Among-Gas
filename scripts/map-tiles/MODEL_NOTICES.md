# Third-party model notice — Stage 1 super-resolution

This project optionally uses **RealESRGAN_x4plus_anime_6B** for offline map-art
super-resolution. The model is used only to create an unapproved candidate image;
it is not included in the game client or runtime.

- Architecture and upstream project: https://github.com/xinntao/Real-ESRGAN
- Upstream model release: https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.2.4
- Pinned ONNX conversion: https://huggingface.co/skillsafe-ai/realesrgan-x4plus-anime-6b/tree/c001be5
- Upstream weights SHA-256: `f872d837d3c90ed2e05227bed711af5671a6fd1c9f7d7e91c911a61f155e99da`
- Pinned ONNX file SHA-256: `9a029dae374b2cd4c3eb2dbbed857e22e6d785687c767aa12828e7356b9fb378`
- License: BSD 3-Clause, Copyright (c) 2021 Xintao Wang.

The pinned ONNX model card records that the ONNX artifact is derived from the
upstream checkpoint and documents CPU inference verification. The original
Real-ESRGAN project and model card identify the model as BSD-3-Clause licensed.
Retain this notice and the upstream license if model files are ever redistributed.

This repository does not bundle the model weights. The workflow downloads the
pinned model at execution time and verifies its SHA-256 before inference.
