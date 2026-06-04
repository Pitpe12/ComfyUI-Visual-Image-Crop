import hashlib
import json
import os

import numpy as np
import torch
from PIL import Image, ImageOps, ImageSequence

import comfy.model_management
import folder_paths
import node_helpers


ASPECT_RATIOS = [
    "free",
    "1:1",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "16:9",
    "9:16",
    "21:9",
]


def _ratio_value(aspect_ratio):
    if aspect_ratio == "free" or ":" not in aspect_ratio:
        return None
    left, right = aspect_ratio.split(":", 1)
    try:
        return float(left) / float(right)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _load_image_from_input(image):
    image_path = folder_paths.get_annotated_filepath(image)
    dtype = comfy.model_management.intermediate_dtype()
    device = comfy.model_management.intermediate_device()

    img = node_helpers.pillow(Image.open, image_path)
    output_images = []
    width = None
    height = None

    for frame in ImageSequence.Iterator(img):
        frame = node_helpers.pillow(ImageOps.exif_transpose, frame).convert("RGB")
        if width is None:
            width, height = frame.size
        if frame.size != (width, height):
            continue

        array = np.array(frame).astype(np.float32) / 255.0
        output_images.append(torch.from_numpy(array)[None,].to(dtype=dtype))

    if not output_images:
        raise ValueError(f"No image frames could be loaded from {image}")

    return torch.cat(output_images, dim=0).to(device=device, dtype=dtype)


def _normalize_crop(x, y, width, height, image_width, image_height, aspect_ratio, aspect_lock):
    image_width = max(1, int(image_width))
    image_height = max(1, int(image_height))

    x = int(round(x))
    y = int(round(y))
    width = int(round(width))
    height = int(round(height))

    width = max(1, width)
    height = max(1, height)

    ratio = _ratio_value(aspect_ratio) if aspect_lock else None
    if ratio:
        width = max(1, width)
        height = max(1, int(round(width / ratio)))
        if height > image_height:
            height = image_height
            width = max(1, int(round(height * ratio)))
        if width > image_width:
            width = image_width
            height = max(1, int(round(width / ratio)))

    width = max(1, min(width, image_width))
    height = max(1, min(height, image_height))
    x = max(0, min(x, image_width - width))
    y = max(0, min(y, image_height - height))

    return x, y, width, height


class VisualImageCrop:
    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        files = folder_paths.filter_files_content_types(files, ["image"])

        return {
            "required": {
                "image": (sorted(files), {"image_upload": True}),
                "x": ("INT", {"default": 0, "min": 0, "max": 65535, "step": 1}),
                "y": ("INT", {"default": 0, "min": 0, "max": 65535, "step": 1}),
                "width": ("INT", {"default": 1, "min": 1, "max": 65535, "step": 1}),
                "height": ("INT", {"default": 1, "min": 1, "max": 65535, "step": 1}),
                "aspect_lock": ("BOOLEAN", {"default": False}),
                "aspect_ratio": (ASPECT_RATIOS, {"default": "free"}),
            },
        }

    CATEGORY = "image/crop"
    RETURN_TYPES = ("IMAGE", "IMAGE", "CROP_METADATA", "STRING", "INT", "INT", "INT", "INT")
    RETURN_NAMES = ("uncropped_out", "cropped_out", "crop_metadata", "crop_metadata_json", "x", "y", "width", "height")
    FUNCTION = "crop"

    def crop(self, image, x, y, width, height, aspect_lock, aspect_ratio):
        source = _load_image_from_input(image)
        image_height = source.shape[1]
        image_width = source.shape[2]

        x, y, width, height = _normalize_crop(
            x,
            y,
            width,
            height,
            image_width,
            image_height,
            aspect_ratio,
            aspect_lock,
        )

        cropped = source[:, y : y + height, x : x + width, :]
        metadata = {
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "source_width": int(image_width),
            "source_height": int(image_height),
            "aspect_lock": bool(aspect_lock),
            "aspect_ratio": aspect_ratio,
            "source": "image_picker",
        }

        return (source, cropped, metadata, json.dumps(metadata), x, y, width, height)

    @classmethod
    def IS_CHANGED(cls, image, x, y, width, height, aspect_lock, aspect_ratio):
        image_path = folder_paths.get_annotated_filepath(image)
        digest = hashlib.sha256()
        with open(image_path, "rb") as handle:
            digest.update(handle.read())
        return (digest.hexdigest(), x, y, width, height, aspect_lock, aspect_ratio)

    @classmethod
    def VALIDATE_INPUTS(cls, image, **kwargs):
        if image and folder_paths.exists_annotated_filepath(image):
            return True
        return f"Invalid image file: {image}"


NODE_CLASS_MAPPINGS = {
    "VisualImageCrop": VisualImageCrop,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VisualImageCrop": "Visual Image Crop",
}
