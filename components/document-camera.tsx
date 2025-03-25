"use client"

import type React from "react"

import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { CameraIcon, X, CheckCircle, RefreshCw, ZapIcon, Upload, ImageIcon, Sliders } from "lucide-react"

// Add TypeScript declaration for OpenCV
declare global {
  interface Window {
    cv: any
  }
}

interface DocumentCameraProps {
  onCapture: (imageUri: string, corners: { x: number; y: number }[]) => void
  onError?: (error: string) => void
}

export function DocumentCamera({ onCapture, onError }: DocumentCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const processingCanvasRef = useRef<HTMLCanvasElement>(null)
  const displayCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isDetecting, setIsDetecting] = useState(true)
  const [detectedCorners, setDetectedCorners] = useState<{ x: number; y: number }[] | null>(null)
  const [isGoodDetection, setIsGoodDetection] = useState(false)
  const [flashMode, setFlashMode] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [stableDetectionCount, setStableDetectionCount] = useState(0)
  const [autoCapturing, setAutoCapturing] = useState(false)
  const [autoMode, setAutoMode] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraStarted, setCameraStarted] = useState(false)
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false)
  const [mlModelLoaded, setMlModelLoaded] = useState(false)
  const [mlModelLoading, setMlModelLoading] = useState(false)
  const [useAdvancedDetection, setUseAdvancedDetection] = useState(true)
  const [debugMode, setDebugMode] = useState(false)
  const [lastGoodDetectionTime, setLastGoodDetectionTime] = useState(0)
  const [consecutiveGoodDetections, setConsecutiveGoodDetections] = useState(0)
  const [showGuide, setShowGuide] = useState(true)
  const [cameraResolution, setCameraResolution] = useState({ width: 0, height: 0 })
  const [enhancedView, setEnhancedView] = useState(true)
  const [showProcessingIndicator, setShowProcessingIndicator] = useState(false)
  const [processingTimeout, setProcessingTimeout] = useState<NodeJS.Timeout | null>(null)

  // Reference to store the animation frame ID
  const animationFrameRef = useRef<number | null>(null)

  // Reference to store the last processed frame timestamp
  const lastProcessTimeRef = useRef<number>(0)

  // Add a retry mechanism for camera initialization
  const [cameraInitRetries, setCameraInitRetries] = useState(0)
  const MAX_CAMERA_RETRIES = 3

  // Load CV.js (OpenCV for JavaScript) when component mounts
  useEffect(() => {
    let mounted = true

    const loadOpenCV = async () => {
      if (!mounted) return

      try {
        setMlModelLoading(true)

        // Check if OpenCV.js is already loaded
        if (window.cv) {
          console.log("OpenCV.js already loaded")
          setMlModelLoaded(true)
          setMlModelLoading(false)
          return
        }

        // Set a timeout to ensure we don't block camera functionality
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error("OpenCV.js loading timed out"))
          }, 8000) // Reduced timeout for faster fallback
        })

        // Load OpenCV.js dynamically
        console.log("Loading OpenCV.js...")

        const loadScript = new Promise((resolve, reject) => {
          // Create a script element to load OpenCV.js
          const script = document.createElement("script")
          // Use a more reliable CDN
          script.src = "https://cdn.jsdelivr.net/npm/opencv.js@1.2.1/opencv.min.js"
          script.async = true
          script.onload = () => {
            if (!mounted) return

            console.log("OpenCV.js loaded successfully")

            // Wait for CV to be fully initialized
            const checkCVReady = () => {
              if (window.cv && window.cv.imread) {
                console.log("OpenCV.js is ready to use")
                resolve()
              } else {
                setTimeout(checkCVReady, 100)
              }
            }

            checkCVReady()
          }

          script.onerror = () => {
            if (!mounted) return

            console.error("Failed to load OpenCV.js")
            reject(new Error("Failed to load OpenCV.js"))
          }

          document.body.appendChild(script)
        })

        // Race between loading and timeout
        try {
          await Promise.race([loadScript, timeoutPromise])
          setMlModelLoaded(true)
        } catch (error) {
          console.warn("OpenCV.js loading issue:", error)
          // Fall back to simulated detection, but don't block camera
          setUseAdvancedDetection(false)
        } finally {
          setMlModelLoading(false)
        }
      } catch (error) {
        if (!mounted) return

        console.error("Error loading ML model:", error)
        setMlModelLoading(false)
        // Fall back to simulated detection
        setUseAdvancedDetection(false)
      }
    }

    loadOpenCV()

    return () => {
      mounted = false
    }
  }, [])

  // Start camera on component mount
  useEffect(() => {
    let mounted = true

    const startCamera = async () => {
      if (!mounted) return

      setIsLoading(true)
      setCameraError(null)

      try {
        // Check if mediaDevices is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera access is not supported in this browser")
        }

        // First try to enumerate devices to check if camera exists
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const videoDevices = devices.filter((device) => device.kind === "videoinput")

          if (videoDevices.length === 0) {
            throw new Error("No camera detected on this device")
          }

          console.log(`Found ${videoDevices.length} video devices`)
        } catch (enumError) {
          console.warn("Could not enumerate devices:", enumError)
          // Continue anyway, as some browsers might not support enumeration
        }

        // Request camera access with clear constraints
        // Try different constraints if the first attempt fails
        let mediaStream

        try {
          // First try with basic constraints to ensure it works
          const basicConstraints = {
            video: {
              facingMode: "environment",
            },
            audio: false,
          }

          console.log("Requesting camera access with basic constraints...")
          mediaStream = await navigator.mediaDevices.getUserMedia(basicConstraints)

          // If successful, try to upgrade to better resolution if possible
          try {
            const tracks = mediaStream.getVideoTracks()
            if (tracks.length > 0) {
              const track = tracks[0]
              const capabilities = track.getCapabilities()

              // Check if we can set a better resolution
              if (
                capabilities.width &&
                capabilities.width.max > 1280 &&
                capabilities.height &&
                capabilities.height.max > 720
              ) {
                await track.applyConstraints({
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                })
                console.log("Applied higher resolution constraints")
              }
            }
          } catch (upgradeError) {
            console.warn("Could not upgrade camera resolution:", upgradeError)
            // Continue with the basic stream we already have
          }
        } catch (basicError) {
          console.warn("Failed with basic constraints, trying minimal:", basicError)

          // Try with minimal constraints as a last resort
          const minimalConstraints = { video: true, audio: false }
          mediaStream = await navigator.mediaDevices.getUserMedia(minimalConstraints)
        }

        if (!mounted) {
          // Component unmounted during camera initialization
          mediaStream.getTracks().forEach((track) => track.stop())
          return
        }

        console.log("Camera access granted, setting up video stream")
        setStream(mediaStream)

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream

          // Add event listeners to handle video loading
          videoRef.current.onloadedmetadata = () => {
            if (!mounted) return

            console.log("Video metadata loaded, playing video")
            videoRef.current?.play().catch((e) => {
              console.error("Error playing video:", e)
              handleCameraError("Failed to start video stream. Please refresh and try again.")
            })
          }

          videoRef.current.onplaying = () => {
            if (!mounted) return

            console.log("Video is now playing")
            setIsLoading(false)
            setCameraStarted(true)

            // Store camera resolution for better processing
            if (videoRef.current) {
              setCameraResolution({
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight,
              })
              console.log(`Camera resolution: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`)
            }

            // If we're not using advanced detection, simulate a document after a short delay
            if (!useAdvancedDetection) {
              setTimeout(() => {
                if (mounted) {
                  simulateDocumentDetection()
                }
              }, 1000) // Reduced delay for faster response
            }
          }

          // Add error handler for video element
          videoRef.current.onerror = (e) => {
            console.error("Video element error:", e)
            handleCameraError("Error with video playback. Please try again.")
          }
        }
      } catch (error: any) {
        if (!mounted) return

        console.error("Error accessing camera:", error)

        // Check for permission denied errors
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          setCameraPermissionDenied(true)
          handleCameraError("Camera access denied. Please allow camera access in your browser settings.")
        } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
          handleCameraError("No camera found on this device.")
        } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
          handleCameraError("Camera is already in use by another application.")
        } else {
          handleCameraError(`Camera access failed: ${error.message || "Unknown error"}`)
        }

        setIsLoading(false)
      }
    }

    startCamera()

    return () => {
      mounted = false
      if (stream) {
        console.log("Stopping camera stream")
        stream.getTracks().forEach((track) => track.stop())
      }

      // Clean up animation frame if it exists
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      // Clear any processing timeout
      if (processingTimeout) {
        clearTimeout(processingTimeout)
      }
    }
  }, [])

  // Add this useEffect to handle camera retries
  useEffect(() => {
    if (cameraError && cameraInitRetries < MAX_CAMERA_RETRIES) {
      const retryTimeout = setTimeout(() => {
        console.log(`Retrying camera initialization (attempt ${cameraInitRetries + 1}/${MAX_CAMERA_RETRIES})...`)
        setCameraInitRetries((prev) => prev + 1)
        setCameraError(null)
        setIsLoading(true)

        // Define startCamera function for retry
        const startCamera = async () => {
          try {
            // Check if mediaDevices is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              throw new Error("Camera access is not supported in this browser")
            }

            // Try with minimal constraints for retry
            const basicConstraints = { video: true, audio: false }
            const mediaStream = await navigator.mediaDevices.getUserMedia(basicConstraints)

            setStream(mediaStream)

            if (videoRef.current) {
              videoRef.current.srcObject = mediaStream

              videoRef.current.onloadedmetadata = () => {
                videoRef.current?.play().catch((e) => {
                  console.error("Error playing video on retry:", e)
                  handleCameraError("Failed to start video stream on retry.")
                })
              }

              videoRef.current.onplaying = () => {
                console.log("Video is now playing after retry")
                setIsLoading(false)
                setCameraStarted(true)

                if (videoRef.current) {
                  setCameraResolution({
                    width: videoRef.current.videoWidth,
                    height: videoRef.current.videoHeight,
                  })
                }

                if (!useAdvancedDetection) {
                  setTimeout(() => {
                    simulateDocumentDetection()
                  }, 1000) // Reduced delay
                }
              }
            }
          } catch (error: any) {
            console.error("Error on camera retry:", error)
            setIsLoading(false)
            handleCameraError(`Camera retry failed: ${error.message || "Unknown error"}`)
          }
        }

        startCamera()
      }, 1500) // Reduced wait time before retrying

      setProcessingTimeout(retryTimeout)

      return () => clearTimeout(retryTimeout)
    }
  }, [cameraError, cameraInitRetries])

  // Simulate document detection for testing
  const simulateDocumentDetection = () => {
    if (!videoRef.current) return

    const { videoWidth, videoHeight } = videoRef.current

    // Create a simulated document with A4 proportions
    const centerX = videoWidth / 2
    const centerY = videoHeight / 2

    // A4 aspect ratio is 1:1.414 (portrait)
    const aspectRatio = 1.414

    // Calculate document dimensions
    let docWidth, docHeight

    if (videoWidth > videoHeight) {
      // Landscape orientation
      docHeight = videoHeight * 0.7
      docWidth = docHeight / aspectRatio
    } else {
      // Portrait orientation
      docWidth = videoWidth * 0.7
      docHeight = docWidth * aspectRatio
    }

    // Create corners
    const corners = [
      { x: centerX - docWidth / 2, y: centerY - docHeight / 2 }, // Top-left
      { x: centerX + docWidth / 2, y: centerY - docHeight / 2 }, // Top-right
      { x: centerX + docWidth / 2, y: centerY + docHeight / 2 }, // Bottom-right
      { x: centerX - docWidth / 2, y: centerY + docHeight / 2 }, // Bottom-left
    ]

    setDetectedCorners(corners)
    setIsGoodDetection(true)
    setStableDetectionCount(15) // Set to threshold to enable capture
  }

  // Document detection loop using Computer Vision
  useEffect(() => {
    // Skip if any of these conditions are true
    if (!isDetecting || !videoRef.current || !processingCanvasRef.current || !cameraStarted) return
    if (!useAdvancedDetection || !mlModelLoaded) return

    const PROCESS_INTERVAL = 50 // Reduced interval for more responsive detection (was 80ms)

    const detectDocument = (timestamp: number) => {
      // Only process frames at the specified interval
      if (timestamp - lastProcessTimeRef.current > PROCESS_INTERVAL) {
        lastProcessTimeRef.current = timestamp

        if (videoRef.current && processingCanvasRef.current && !isProcessing) {
          setIsProcessing(true)
          setShowProcessingIndicator(true)

          // Set a timeout to hide the processing indicator if it takes too long
          const timeout = setTimeout(() => {
            setShowProcessingIndicator(false)
          }, 500)

          setProcessingTimeout(timeout)

          try {
            const corners = detectDocumentWithCV()

            if (corners && corners.length === 4) {
              setDetectedCorners(corners)

              // Check if it's a good detection
              const isGood = evaluateDetectionQuality(corners)
              setIsGoodDetection(isGood)

              // If we have a good detection, track consecutive good detections
              if (isGood) {
                const now = Date.now()

                // If this detection is within 300ms of the last good one, increment counter
                if (now - lastGoodDetectionTime < 300) {
                  setConsecutiveGoodDetections((prev) => prev + 1)
                } else {
                  // Reset counter if too much time has passed
                  setConsecutiveGoodDetections(1)
                }

                setLastGoodDetectionTime(now)
                setStableDetectionCount((prev) => Math.min(prev + 1, 20))

                // Hide guide after good detection
                if (showGuide) {
                  setShowGuide(false)
                }
              } else {
                setConsecutiveGoodDetections(0)
                setStableDetectionCount((prev) => Math.max(prev - 1, 0))
              }

              // Draw enhanced view if enabled
              if (enhancedView && displayCanvasRef.current && videoRef.current) {
                drawEnhancedView(corners, isGood)
              }
            } else {
              // Gradually decrease the stable detection count if no document is found
              setConsecutiveGoodDetections(0)
              setStableDetectionCount((prev) => Math.max(prev - 1, 0))

              // Only clear detected corners if we've had no good detection for a while
              if (stableDetectionCount <= 3) {
                setDetectedCorners(null)
                setIsGoodDetection(false)

                // Show guide again if no document is detected
                if (!showGuide) {
                  setShowGuide(true)
                }
              }
            }
          } catch (error) {
            console.error("Error in document detection:", error)
          } finally {
            setIsProcessing(false)
            // Clear the timeout
            if (processingTimeout) {
              clearTimeout(processingTimeout)
            }
            setShowProcessingIndicator(false)
          }
        }
      }

      // Continue the detection loop
      animationFrameRef.current = requestAnimationFrame(detectDocument)
    }

    // Start the detection loop
    animationFrameRef.current = requestAnimationFrame(detectDocument)

    // Clean up on unmount or when dependencies change
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      // Clear any processing timeout
      if (processingTimeout) {
        clearTimeout(processingTimeout)
      }
    }
  }, [
    isDetecting,
    isProcessing,
    cameraStarted,
    useAdvancedDetection,
    mlModelLoaded,
    stableDetectionCount,
    lastGoodDetectionTime,
    enhancedView,
    showGuide,
  ])

  // Draw enhanced view with document highlighting and shadow
  const drawEnhancedView = (corners: { x: number; y: number }[], isGood: boolean) => {
    if (!videoRef.current || !displayCanvasRef.current) return

    const video = videoRef.current
    const canvas = displayCanvasRef.current

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Draw the current video frame to the canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Apply a slight darkening filter to the entire image
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw the document area with original brightness
    if (corners && corners.length === 4) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < corners.length; i++) {
        ctx.lineTo(corners[i].x, corners[i].y)
      }
      ctx.closePath()
      ctx.clip()

      // Draw the original video frame in the clipped area
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Add a subtle inner shadow for depth
      ctx.shadowBlur = 20
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)"
      ctx.lineWidth = 2
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"
      ctx.stroke()

      ctx.restore()

      // Draw the outline with appropriate color
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < corners.length; i++) {
        ctx.lineTo(corners[i].x, corners[i].y)
      }
      ctx.closePath()

      ctx.lineWidth = 3
      ctx.strokeStyle = isGood ? "#10b981" : "#f59e0b"
      ctx.stroke()

      // Draw corner markers
      corners.forEach((corner) => {
        ctx.beginPath()
        ctx.arc(corner.x, corner.y, 6, 0, 2 * Math.PI)
        ctx.fillStyle = isGood ? "#10b981" : "#f59e0b"
        ctx.fill()
      })
    }
  }

  // Auto-capture when we have a stable detection for a certain period
  useEffect(() => {
    // If we have 3 consecutive good detections in a short time window, capture automatically
    if (autoMode && consecutiveGoodDetections >= 3 && !autoCapturing) {
      setAutoCapturing(true)
      // Start a countdown animation
      setTimeout(() => {
        handleCapture()
      }, 200) // Shorter delay for more responsive capture
    }
    // Also keep the original stable detection counter as a fallback
    else if (autoMode && stableDetectionCount >= 10 && !autoCapturing) {
      setAutoCapturing(true)
      // Start a countdown animation
      setTimeout(() => {
        handleCapture()
      }, 300)
    }
  }, [stableDetectionCount, autoMode, autoCapturing, consecutiveGoodDetections])

  // Detect document using OpenCV.js with Google Drive-like techniques
  const detectDocumentWithCV = () => {
    if (!videoRef.current || !processingCanvasRef.current || !window.cv) return null

    try {
      const video = videoRef.current
      const canvas = processingCanvasRef.current

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext("2d")
      if (!ctx) return null

      // Draw the current video frame to the canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Create variables outside the try block for cleanup
      let src, dst, gray, blurred, edges, contours, hierarchy

      try {
        // Convert canvas to OpenCV Mat
        src = window.cv.imread(canvas)

        // Create a destination for edge detection
        dst = new window.cv.Mat()
        gray = new window.cv.Mat()
        blurred = new window.cv.Mat()
        edges = new window.cv.Mat()

        // Convert to grayscale
        window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY)

        // Apply Gaussian blur to reduce noise
        const ksize = new window.cv.Size(5, 5)
        window.cv.GaussianBlur(gray, blurred, ksize, 0)

        // Apply adaptive threshold to handle different lighting conditions
        // This is similar to what Google Drive scanner does
        window.cv.adaptiveThreshold(
          blurred,
          edges,
          255,
          window.cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          window.cv.THRESH_BINARY_INV,
          11,
          2,
        )

        // Apply morphological operations to close gaps in the edges
        const kernel = window.cv.Mat.ones(3, 3, window.cv.CV_8U)
        window.cv.morphologyEx(edges, edges, window.cv.MORPH_CLOSE, kernel)

        // Find contours
        contours = new window.cv.MatVector()
        hierarchy = new window.cv.Mat()
        window.cv.findContours(edges, contours, hierarchy, window.cv.RETR_LIST, window.cv.CHAIN_APPROX_SIMPLE)

        // Find the largest contour that could be a document
        let maxArea = 0
        let maxContourIndex = -1

        // Calculate minimum area threshold (2% of image)
        const minArea = canvas.width * canvas.height * 0.02

        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i)
          const area = window.cv.contourArea(contour)

          // Filter out small contours
          if (area > minArea) {
            const perimeter = window.cv.arcLength(contour, true)
            const approx = new window.cv.Mat()
            window.cv.approxPolyDP(contour, approx, 0.02 * perimeter, true)

            // Check if the contour has 4 points (quadrilateral)
            if (approx.rows === 4 && area > maxArea) {
              maxArea = area
              maxContourIndex = i
            }

            approx.delete()
          }
        }

        // If we found a suitable contour
        if (maxContourIndex !== -1) {
          const contour = contours.get(maxContourIndex)
          const perimeter = window.cv.arcLength(contour, true)
          const approx = new window.cv.Mat()
          window.cv.approxPolyDP(contour, approx, 0.02 * perimeter, true)

          // Extract the corners
          const corners = []
          for (let i = 0; i < 4; i++) {
            const point = new window.cv.Point(approx.data32S[i * 2], approx.data32S[i * 2 + 1])
            corners.push({ x: point.x, y: point.y })
          }

          // Draw the contour on the canvas if in debug mode
          if (debugMode) {
            const color = new window.cv.Scalar(0, 255, 0, 255)
            window.cv.drawContours(src, contours, maxContourIndex, color, 2)
            window.cv.imshow(canvas, src)
          }

          // Clean up
          approx.delete()

          // Sort corners in clockwise order: top-left, top-right, bottom-right, bottom-left
          const sortedCorners = sortCorners(corners)

          // Clean up OpenCV objects
          src.delete()
          dst.delete()
          gray.delete()
          blurred.delete()
          edges.delete()
          contours.delete()
          hierarchy.delete()
          kernel.delete()

          return sortedCorners
        }

        // Clean up OpenCV objects
        src.delete()
        dst.delete()
        gray.delete()
        blurred.delete()
        edges.delete()
        contours.delete()
        hierarchy.delete()
        kernel.delete()

        return null
      } catch (cvError) {
        console.error("OpenCV processing error:", cvError)

        // Clean up OpenCV objects
        if (src) src.delete()
        if (dst) dst.delete()
        if (gray) gray.delete()
        if (blurred) blurred.delete()
        if (edges) edges.delete()
        if (contours) contours.delete()
        if (hierarchy) hierarchy.delete()

        return null
      }
    } catch (error) {
      console.error("Error in document detection:", error)
      return null
    }
  }

  // Sort corners in clockwise order: top-left, top-right, bottom-right, bottom-left
  const sortCorners = (corners: { x: number; y: number }[]) => {
    if (corners.length !== 4) return corners

    // Calculate the center point
    const center = {
      x: corners.reduce((sum, corner) => sum + corner.x, 0) / corners.length,
      y: corners.reduce((sum, corner) => sum + corner.y, 0) / corners.length,
    }

    // Sort corners based on their position relative to the center
    return corners.sort((a, b) => {
      // Determine which quadrant each point is in
      const aQuadrant = getQuadrant(a, center)
      const bQuadrant = getQuadrant(b, center)

      if (aQuadrant !== bQuadrant) {
        return aQuadrant - bQuadrant
      }

      // If in the same quadrant, sort by distance from center
      const aDist = Math.hypot(a.x - center.x, a.y - center.y)
      const bDist = Math.hypot(b.x - center.x, b.y - center.y)
      return bDist - aDist
    })
  }

  // Helper function to determine which quadrant a point is in
  const getQuadrant = (point: { x: number; y: number }, center: { x: number; y: number }) => {
    if (point.x < center.x && point.y < center.y) return 0 // Top-left
    if (point.x >= center.x && point.y < center.y) return 1 // Top-right
    if (point.x >= center.x && point.y >= center.y) return 2 // Bottom-right
    return 3 // Bottom-left
  }

  // Evaluate if the current detection is good quality, optimized for A4
  const evaluateDetectionQuality = (corners: { x: number; y: number }[]) => {
    if (!videoRef.current || corners.length !== 4) return false

    const { videoWidth, videoHeight } = videoRef.current
    const screenArea = videoWidth * videoHeight

    // Calculate the area of the quadrilateral
    const area = calculateQuadrilateralArea(corners)

    // Check if document takes up a reasonable portion of the screen
    const areaRatio = area / screenArea

    // Check if the shape is close to A4 aspect ratio (1:1.414)
    const { width, height } = calculateQuadrilateralDimensions(corners)
    const aspectRatio = width / height
    const idealA4Ratio = 1 / 1.414 // For portrait A4
    const aspectRatioTolerance = 0.3

    const isA4Ratio =
      Math.abs(aspectRatio - idealA4Ratio) < aspectRatioTolerance ||
      Math.abs(aspectRatio - 1.414) < aspectRatioTolerance // Also check landscape A4

    // Check if the corners form a convex quadrilateral
    const isConvex = isConvexQuadrilateral(corners)

    // Document should take up 10-90% of the screen, have A4-like proportions, and be convex
    return areaRatio > 0.1 && areaRatio < 0.9 && isA4Ratio && isConvex
  }

  // Calculate the area of a quadrilateral using the Shoelace formula
  const calculateQuadrilateralArea = (corners: { x: number; y: number }[]) => {
    let area = 0

    for (let i = 0; i < corners.length; i++) {
      const j = (i + 1) % corners.length
      area += corners[i].x * corners[j].y
      area -= corners[j].x * corners[i].y
    }

    return Math.abs(area) / 2
  }

  // Calculate approximate width and height of a quadrilateral
  const calculateQuadrilateralDimensions = (corners: { x: number; y: number }[]) => {
    // Calculate the average of opposite sides
    const width1 = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y)
    const width2 = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y)

    const height1 = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y)
    const height2 = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y)

    return {
      width: (width1 + width2) / 2,
      height: (height1 + height2) / 2,
    }
  }

  // Check if the quadrilateral is convex
  const isConvexQuadrilateral = (corners: { x: number; y: number }[]) => {
    if (corners.length !== 4) return false

    // A quadrilateral is convex if all interior angles are less than 180 degrees
    // We can check this by ensuring all cross products have the same sign
    let sign = 0

    for (let i = 0; i < corners.length; i++) {
      const j = (i + 1) % corners.length
      const k = (i + 2) % corners.length

      const dx1 = corners[j].x - corners[i].x
      const dy1 = corners[j].y - corners[i].y
      const dx2 = corners[k].x - corners[j].x
      const dy2 = corners[k].y - corners[j].y

      const cross = dx1 * dy2 - dy1 * dx2

      if (i === 0) {
        sign = Math.sign(cross)
      } else if (Math.sign(cross) !== sign) {
        return false
      }
    }

    return true
  }

  // Handle manual or auto capture
  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current || !detectedCorners) return

    const video = videoRef.current
    const canvas = canvasRef.current

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Draw the current video frame to the canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert canvas to data URL
    const imageUri = canvas.toDataURL("image/jpeg", 0.95)

    // Pass the image and detected corners to the parent component
    onCapture(imageUri, detectedCorners)
  }

  // Toggle flash mode
  const toggleFlash = () => {
    if (stream) {
      const tracks = stream.getVideoTracks()
      if (tracks.length > 0) {
        const track = tracks[0]
        const capabilities = track.getCapabilities()

        // Check if torch is supported
        if (capabilities.torch) {
          const newFlashMode = !flashMode
          track
            .applyConstraints({
              advanced: [{ torch: newFlashMode }],
            })
            .then(() => {
              setFlashMode(newFlashMode)
            })
            .catch((e) => {
              console.error("Error toggling flash:", e)
            })
        }
      }
    }
  }

  // Toggle auto mode
  const toggleAutoMode = () => {
    setAutoMode(!autoMode)
    setStableDetectionCount(0)
    setConsecutiveGoodDetections(0)
  }

  // Toggle enhanced view
  const toggleEnhancedView = () => {
    setEnhancedView(!enhancedView)
  }

  // Toggle advanced detection mode
  const toggleAdvancedDetection = () => {
    const newMode = !useAdvancedDetection
    setUseAdvancedDetection(newMode)

    // If turning off advanced detection, simulate a document
    if (!newMode) {
      simulateDocumentDetection()
    } else {
      // If turning on advanced detection but ML model isn't loaded, load it
      if (!mlModelLoaded && !mlModelLoading) {
        // This would trigger the useEffect to load the model
        setMlModelLoading(true)
      }
    }
  }

  // Close camera
  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }
    // Navigate back or close camera
    window.history.back()
  }

  // Update error handling to call the onError prop
  const handleCameraError = (errorMessage: string) => {
    console.error("Camera error:", errorMessage)
    setCameraError(errorMessage)
    if (onError) {
      onError(errorMessage)
    }
  }

  // Handle file upload as a fallback
  const handleFileUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const imageDataUrl = e.target?.result as string

      // Create a new image to get dimensions
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        // Create simulated corners for an A4 document
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

        onCapture(imageDataUrl, corners)
      }
      img.src = imageDataUrl
    }
    reader.readAsDataURL(file)
  }

  // Add loading and error UI to the return statement
  return (
    <div className="relative w-full h-[600px] bg-black">
      {/* Hidden file input for fallback */}
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-white text-center">
            <div className="w-16 h-16 border-4 border-t-primary border-opacity-50 rounded-full animate-spin mx-auto mb-4"></div>
            <p>Acessando câmera...</p>
            <p className="text-sm text-gray-400 mt-2">Por favor, permita o acesso à câmera quando solicitado</p>
          </div>
        </div>
      )}

      {mlModelLoading && !isLoading && (
        <div className="absolute top-4 left-0 right-0 flex justify-center z-10">
          <div className="bg-black/70 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <p>Carregando modelo de detecção...</p>
          </div>
        </div>
      )}

      {showProcessingIndicator && (
        <div className="absolute top-4 left-0 right-0 flex justify-center z-10">
          <div className="bg-black/70 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
            <Sliders className="h-4 w-4 animate-pulse" />
            <p>Processando imagem...</p>
          </div>
        </div>
      )}

      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-white text-center p-6 max-w-md">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-red-500 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-xl font-bold mb-2">Erro de Câmera</h3>
            <p className="mb-4">{cameraError}</p>
            <div className="flex flex-col gap-3">
              <Button onClick={handleFileUpload} className="w-full">
                <Upload className="h-4 w-4 mr-2" />
                Fazer Upload de Imagem
              </Button>
              <Button variant="outline" onClick={handleClose} className="w-full">
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Video element (hidden when enhanced view is enabled) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover ${enhancedView ? "hidden" : ""}`}
        style={{ transform: "scaleX(1)" }}
      />

      {/* Enhanced view canvas */}
      <canvas
        ref={displayCanvasRef}
        className={`absolute inset-0 w-full h-full object-cover ${enhancedView ? "" : "hidden"}`}
      />

      {/* Hidden canvas for processing */}
      <canvas ref={processingCanvasRef} className="hidden" />

      {/* Canvas for capturing the final image */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Document outline overlay (only shown when enhanced view is disabled) */}
      {detectedCorners && !enhancedView && (
        <div className="absolute inset-0 pointer-events-none">
          <svg className="w-full h-full">
            <polygon
              points={detectedCorners.map((corner) => `${corner.x},${corner.y}`).join(" ")}
              fill="none"
              stroke={isGoodDetection ? "#10b981" : "#f59e0b"}
              strokeWidth="3"
            />
            {/* Draw corner markers */}
            {detectedCorners.map((corner, index) => (
              <circle key={index} cx={corner.x} cy={corner.y} r="6" fill={isGoodDetection ? "#10b981" : "#f59e0b"} />
            ))}
          </svg>
        </div>
      )}

      {/* Auto-capture countdown animation */}
      {autoCapturing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center animate-ping">
            <div className="w-16 h-16 rounded-full bg-green-500/40 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-green-500/60"></div>
            </div>
          </div>
        </div>
      )}

      {/* Detection status indicator */}
      <div className="absolute top-4 left-0 right-0 flex justify-center">
        <div
          className={`${isGoodDetection ? "bg-green-500/90" : "bg-black/70"} text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-lg`}
        >
          {isGoodDetection ? (
            <>
              <CheckCircle className="h-4 w-4" />
              {autoMode ? `Documento detectado (${consecutiveGoodDetections}/3)` : "Documento detectado"}
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Procurando documento...
            </>
          )}
        </div>
      </div>

      {/* Camera controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-between items-center">
        <div className="flex gap-2">
          <Button
            onClick={toggleFlash}
            variant="outline"
            size="icon"
            className={`${flashMode ? "bg-yellow-400 text-black" : "bg-white/80 text-black"} rounded-full`}
          >
            <ZapIcon className="h-5 w-5" />
          </Button>

          <Button
            onClick={toggleEnhancedView}
            variant="outline"
            size="icon"
            className={`${enhancedView ? "bg-primary text-white" : "bg-white/80 text-black"} rounded-full`}
            title={enhancedView ? "Visualização aprimorada" : "Visualização normal"}
          >
            <ImageIcon className="h-5 w-5" />
          </Button>

          <Button
            onClick={toggleAutoMode}
            variant="outline"
            size="icon"
            className={`${autoMode ? "bg-primary text-white" : "bg-white/80 text-black"} rounded-full`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
            </svg>
          </Button>
        </div>

        <Button
          onClick={handleCapture}
          disabled={!isGoodDetection || autoCapturing}
          size="icon"
          className={`w-16 h-16 rounded-full ${
            isGoodDetection && !autoCapturing
              ? "bg-white hover:bg-white/90 text-black"
              : "bg-white/50 cursor-not-allowed"
          }`}
        >
          <CameraIcon className="h-8 w-8" />
        </Button>

        <Button onClick={handleClose} variant="outline" size="icon" className="bg-white/80 text-black rounded-full">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Scanning guide overlay */}
      {showGuide && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="border-2 border-dashed border-white/70 rounded-lg w-[70%] h-[85%] aspect-[1/1.414] flex items-center justify-center">
            <div className="text-white/80 text-center text-sm">
              <p>Alinhe o documento dentro da moldura</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

