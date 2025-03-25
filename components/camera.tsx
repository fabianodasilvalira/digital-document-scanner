"use client"

import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { CameraIcon, X, CheckCircle } from "lucide-react"

interface CameraProps {
  onCapture: (imageUri: string) => void
}

export function Camera({ onCapture }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectedCorners, setDetectedCorners] = useState<{ x: number; y: number }[] | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        })
        setStream(mediaStream)

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      } catch (error) {
        console.error("Error accessing camera:", error)
      }
    }

    startCamera()

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    if (isDetecting && videoRef.current && canvasRef.current) {
      const detectDocumentInterval = setInterval(() => {
        // Simulate document detection
        // In a real app, this would use OpenCV.js or a similar library
        const randomCorners = simulateDocumentDetection()
        setDetectedCorners(randomCorners)
      }, 500)

      return () => clearInterval(detectDocumentInterval)
    }
  }, [isDetecting])

  const simulateDocumentDetection = () => {
    if (!videoRef.current) return null

    const width = videoRef.current.videoWidth
    const height = videoRef.current.videoHeight

    // Simulate document corners with some random variation
    // In a real app, this would be replaced with actual document detection
    const margin = Math.min(width, height) * 0.15
    return [
      { x: margin + Math.random() * 20, y: margin + Math.random() * 20 },
      { x: width - margin - Math.random() * 20, y: margin + Math.random() * 20 },
      { x: width - margin - Math.random() * 20, y: height - margin - Math.random() * 20 },
      { x: margin + Math.random() * 20, y: height - margin - Math.random() * 20 },
    ]
  }

  const handleStartDetection = () => {
    setIsDetecting(true)
  }

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Draw the video frame to the canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // If we have detected corners, draw them
    if (detectedCorners) {
      ctx.strokeStyle = "#10b981"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(detectedCorners[0].x, detectedCorners[0].y)
      detectedCorners.forEach((corner, i) => {
        const nextCorner = detectedCorners[(i + 1) % detectedCorners.length]
        ctx.lineTo(nextCorner.x, nextCorner.y)
      })
      ctx.stroke()
    }

    // Convert canvas to data URL
    const imageUri = canvas.toDataURL("image/jpeg")
    onCapture(imageUri)
  }

  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }
    // Navigate back or close camera
    window.history.back()
  }

  return (
    <div className="relative w-full h-[500px] bg-black">
      <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />

      {detectedCorners && (
        <div className="absolute inset-0 pointer-events-none">
          <svg className="w-full h-full">
            <polygon
              points={detectedCorners.map((corner) => `${corner.x},${corner.y}`).join(" ")}
              fill="none"
              stroke="#10b981"
              strokeWidth="3"
            />
          </svg>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-between items-center">
        {!isDetecting ? (
          <Button onClick={handleStartDetection} variant="outline" className="bg-white text-black">
            Detect Document
          </Button>
        ) : (
          <Button onClick={handleCapture} size="icon" className="w-16 h-16 rounded-full bg-white text-black">
            <CameraIcon className="h-8 w-8" />
          </Button>
        )}

        <Button onClick={handleClose} variant="outline" size="icon" className="bg-white text-black">
          <X className="h-6 w-6" />
        </Button>
      </div>

      {isDetecting && detectedCorners && (
        <div className="absolute top-4 left-0 right-0 flex justify-center">
          <div className="bg-black/70 text-white px-4 py-2 rounded-full flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Document detected
          </div>
        </div>
      )}
    </div>
  )
}

