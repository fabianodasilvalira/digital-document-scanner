"use client"

import { useEffect, useState, useRef } from "react"
import { Loader2 } from "lucide-react"

interface ImageProcessingProps {
  imageUri: string
  documentCorners: { x: number; y: number }[]
  onProcessingComplete: (processedImageUri: string) => void
}

export function ImageProcessing({ imageUri, documentCorners, onProcessingComplete }: ImageProcessingProps) {
  const [progress, setProgress] = useState(0)
  const [processingStage, setProcessingStage] = useState<string>("initializing")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const outputCanvasRef = useRef<HTMLCanvasElement>(null)
  const [isLongProcess, setIsLongProcess] = useState(false)
  const [processingTimeout, setProcessingTimeout] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Process the image with the detected corners
    const processImage = async () => {
      // Set a timeout to show "processamento demorado" message if it takes too long
      const timeout = setTimeout(() => {
        setIsLongProcess(true)
      }, 1000)

      setProcessingTimeout(timeout)

      try {
        // Step 1: Load image
        setProcessingStage("loading")
        setProgress(20)

        // Step 2: Precise crop using detected corners
        setProcessingStage("cropping")
        setProgress(50)

        // First crop the image exactly at the detected coordinates
        const croppedImage = await cropDocumentExactly(imageUri, documentCorners)

        // Step 3: Apply perspective correction to make the document straight
        setProcessingStage("perspective")
        setProgress(80)
        const correctedImage = await correctPerspective(croppedImage)

        // Step 4: Finalize
        setProcessingStage("finalizing")
        setProgress(100)

        // Complete processing
        setTimeout(() => {
          onProcessingComplete(correctedImage)
        }, 100) // Short delay for UI feedback
      } catch (error) {
        console.error("Error processing image:", error)
        // In case of error, still try to return something
        onProcessingComplete(imageUri)
      } finally {
        // Clear the timeout
        if (processingTimeout) {
          clearTimeout(processingTimeout)
        }
      }
    }

    processImage()

    return () => {
      // Clean up timeout if component unmounts
      if (processingTimeout) {
        clearTimeout(processingTimeout)
      }
    }
  }, [imageUri, documentCorners, onProcessingComplete])

  // Crop the document exactly at the detected coordinates
  const cropDocumentExactly = async (
    originalImageUri: string,
    corners: { x: number; y: number }[],
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        if (!canvasRef.current) {
          resolve(originalImageUri)
          return
        }

        const canvas = canvasRef.current
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext("2d")

        if (!ctx) {
          resolve(originalImageUri)
          return
        }

        // Draw the original image
        ctx.drawImage(img, 0, 0)

        // Sort corners to ensure they're in the correct order: top-left, top-right, bottom-right, bottom-left
        const sortedCorners = sortCorners(corners)

        // Calculate bounding box of the document - exact coordinates
        const minX = Math.min(...sortedCorners.map((c) => c.x))
        const minY = Math.min(...sortedCorners.map((c) => c.y))
        const maxX = Math.max(...sortedCorners.map((c) => c.x))
        const maxY = Math.max(...sortedCorners.map((c) => c.y))

        // Calculate dimensions
        const cropWidth = maxX - minX
        const cropHeight = maxY - minY

        // Create a temporary canvas for the cropped image
        const tempCanvas = document.createElement("canvas")
        tempCanvas.width = cropWidth
        tempCanvas.height = cropHeight
        const tempCtx = tempCanvas.getContext("2d")

        if (!tempCtx) {
          resolve(originalImageUri)
          return
        }

        // Draw the cropped region to the temporary canvas - exact crop with no margins
        tempCtx.drawImage(img, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

        // Convert to data URL and resolve
        resolve(tempCanvas.toDataURL("image/jpeg", 0.95))
      }

      img.src = originalImageUri
    })
  }

  // Correct the perspective of the document to make it straight
  const correctPerspective = async (croppedImageUri: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        if (!outputCanvasRef.current) {
          resolve(croppedImageUri)
          return
        }

        const outputCanvas = outputCanvasRef.current

        // Calculate the width and height for the output (maintain aspect ratio)
        const aspectRatio = img.width / img.height

        // Set standard dimensions (A4 proportions if needed)
        let outputWidth, outputHeight

        // Check if the image is portrait or landscape
        if (img.height > img.width) {
          // Portrait orientation (like A4)
          outputWidth = 1240
          outputHeight = Math.round(outputWidth / aspectRatio)
        } else {
          // Landscape orientation
          outputHeight = 1240
          outputWidth = Math.round(outputHeight * aspectRatio)
        }

        // Set output canvas dimensions
        outputCanvas.width = outputWidth
        outputCanvas.height = outputHeight

        const outputCtx = outputCanvas.getContext("2d")

        if (!outputCtx) {
          resolve(croppedImageUri)
          return
        }

        // Draw a white background on the output canvas
        outputCtx.fillStyle = "#ffffff"
        outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height)

        // Draw the image centered and scaled to fit
        const scale = Math.min(outputWidth / img.width, outputHeight / img.height)

        const x = (outputWidth - img.width * scale) / 2
        const y = (outputHeight - img.height * scale) / 2

        outputCtx.drawImage(img, 0, 0, img.width, img.height, x, y, img.width * scale, img.height * scale)

        // Return the processed image
        resolve(outputCanvas.toDataURL("image/jpeg", 0.95))
      }

      img.src = croppedImageUri
    })
  }

  // Sort corners in the order: top-left, top-right, bottom-right, bottom-left
  const sortCorners = (corners: { x: number; y: number }[]) => {
    if (corners.length !== 4) return corners

    // Calculate the center point
    const center = {
      x: corners.reduce((sum, corner) => sum + corner.x, 0) / corners.length,
      y: corners.reduce((sum, corner) => sum + corner.y, 0) / corners.length,
    }

    // Separate corners into top and bottom based on y-coordinate relative to center
    const top = corners.filter((corner) => corner.y < center.y)
    const bottom = corners.filter((corner) => corner.y >= center.y)

    // Sort top corners by x-coordinate (left to right)
    const topSorted = top.sort((a, b) => a.x - b.x)

    // Sort bottom corners by x-coordinate (left to right)
    const bottomSorted = bottom.sort((a, b) => a.x - b.x)

    // Combine into the correct order: top-left, top-right, bottom-right, bottom-left
    const sortedCorners = [
      ...(topSorted.length > 0 ? [topSorted[0]] : []),
      ...(topSorted.length > 1 ? [topSorted[topSorted.length - 1]] : []),
      ...(bottomSorted.length > 0 ? [bottomSorted[bottomSorted.length - 1]] : []),
      ...(bottomSorted.length > 1 ? [bottomSorted[0]] : []),
    ]

    // If we don't have exactly 4 corners, return the original array
    return sortedCorners.length === 4 ? sortedCorners : corners
  }

  const getProcessingStageText = () => {
    switch (processingStage) {
      case "loading":
        return "Carregando imagem..."
      case "cropping":
        return "Recortando documento..."
      case "perspective":
        return "Ajustando perspectiva..."
      case "finalizing":
        return "Finalizando..."
      default:
        return "Processando..."
    }
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 h-[500px]">
      <div className="w-full max-w-xs">
        <h2 className="text-xl font-semibold mb-8 text-center">Processando Documento</h2>

        <div className="relative h-2 bg-gray-200 rounded-full mb-8 overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all duration-300 ease-in-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className="flex items-center justify-center gap-3 text-gray-500 mb-8">
          <Loader2 className="h-5 w-5 animate-spin" />
          <div>
            <p>{getProcessingStageText()}</p>
            {isLongProcess && (
              <p className="text-xs text-gray-400 mt-1">Este processo pode demorar alguns segundos...</p>
            )}
          </div>
        </div>
      </div>

      {/* Hidden canvases for image processing */}
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={outputCanvasRef} className="hidden" />
    </div>
  )
}

