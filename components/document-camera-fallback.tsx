"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload, Camera, ImageIcon } from "lucide-react"

interface DocumentCameraFallbackProps {
  onCapture: (imageUri: string, corners: { x: number; y: number }[]) => void
  onCancel: () => void
}

export function DocumentCameraFallback({ onCapture, onCancel }: DocumentCameraFallbackProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const imageDataUrl = e.target?.result as string
      setSelectedImage(imageDataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleConfirm = () => {
    if (!selectedImage) return

    // Create simulated corners for an A4 document
    // In a real app, we would use image processing to detect corners
    // Here we're just creating a rectangle in the center of the image
    const img = new Image()
    img.onload = () => {
      const width = img.width
      const height = img.height

      // Create corners for a centered A4-like rectangle (70% of the image)
      const docWidth = width * 0.7
      const docHeight = height * 0.7
      const left = (width - docWidth) / 2
      const top = (height - docHeight) / 2
      const right = left + docWidth
      const bottom = top + docHeight

      const corners = [
        { x: left, y: top }, // Top-left
        { x: right, y: top }, // Top-right
        { x: right, y: bottom }, // Bottom-right
        { x: left, y: bottom }, // Bottom-left
      ]

      onCapture(selectedImage, corners)
    }
    img.src = selectedImage
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 h-[600px] bg-gray-100 dark:bg-gray-900">
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />

      {!selectedImage ? (
        <div className="text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Camera className="h-10 w-10 text-primary" />
          </div>

          <h2 className="text-xl font-semibold mb-4">Camera Unavailable</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm">
            Please upload an image of your document instead
          </p>

          <div className="flex flex-col gap-4">
            <Button onClick={handleUploadClick} className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Document Image
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full">
          <div className="relative w-full max-h-[400px] overflow-hidden rounded-lg mb-6">
            <img
              src={selectedImage || "/placeholder.svg"}
              alt="Selected document"
              className="max-w-full max-h-[400px] object-contain mx-auto"
            />

            {/* Overlay showing A4 document outline */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-dashed border-primary/70 rounded-lg w-[70%] h-[85%] aspect-[1/1.414]"></div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button variant="outline" onClick={() => setSelectedImage(null)}>
              Choose Another
            </Button>
            <Button onClick={handleConfirm}>
              <ImageIcon className="h-4 w-4 mr-2" />
              Process Document
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

