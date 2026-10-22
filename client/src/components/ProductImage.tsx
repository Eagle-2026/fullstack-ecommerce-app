"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

type ProductImageProps = {
  imageUrl: string;
  name: string;
};

export default function ProductImage({ imageUrl, name }: ProductImageProps) {
  const [failedImage, setFailedImage] = useState<string | null>(null);

  // Only accept HTTPS image URLs.
  const safeImageUrl = imageUrl?.startsWith("https://") ? imageUrl : null;

  const showImage = safeImageUrl !== null && failedImage !== safeImageUrl;

  return (
    <div className="flex aspect-4/3 w-full items-center justify-center overflow-hidden bg-gray-100">
      {showImage ? (
        <img
          src={safeImageUrl ?? undefined}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => {
            setFailedImage(safeImageUrl);
          }}
        />
      ) : (
        <div
          role="img"
          aria-label={`No image available for ${name}`}
          className="px-6 text-center text-sm font-medium text-gray-400"
        >
          Image not available
        </div>
      )}
    </div>
  );
}
