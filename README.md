# ComfyUI Visual Image Crop

Interactive image crop node for ComfyUI with an in-node crop rectangle, upload/drop/paste image loading, numeric controls, aspect-ratio helpers, and crop metadata output.

## Features

- Upload, drag-and-drop, or paste an image into the node image picker.
- Visual crop rectangle drawn directly inside the node.
- Drag the crop box or resize it with corner/edge handles.
- Fine-tune crop coordinates with saved widgets:
  - `x`
  - `y`
  - `width`
  - `height`
- `width` and `height` are clamped to a minimum of `1` pixel.
- Optional aspect ratio lock with common ratios:
  - `1:1`
  - `4:3`
  - `3:4`
  - `3:2`
  - `2:3`
  - `16:9`
  - `9:16`
  - `21:9`
- Action buttons:
  - Reset crop
  - Center crop
  - Fit aspect
- Outputs:
  - `uncropped_out`
  - `cropped_out`
  - `crop_metadata`
  - `crop_metadata_json`
  - `x`
  - `y`
  - `width`
  - `height`

The same crop rectangle is applied to every image in the loaded batch.

## Installation

Clone this repository into your ComfyUI `custom_nodes` folder:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Pitpe12/ComfyUI-Visual-Image-Crop.git
```

Restart ComfyUI.

## Usage

Add the node:

```text
image/crop -> Visual Image Crop
```

Load an image through the node image picker by selecting, uploading, dragging and dropping, or pasting an image. Adjust the crop visually or through the numeric widgets, then connect `cropped_out` to downstream image nodes.

## Notes

The node intentionally uses a single image source: the picker/upload image. This keeps the preview and processed image identical and avoids ambiguity with linked image tensors that cannot be previewed before graph execution.

## License

MIT
