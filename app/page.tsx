"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { DocumentCamera } from "@/components/document-camera"
import { DocumentPreview } from "@/components/document-preview"
import { ImageProcessing } from "@/components/image-processing"
import { DocumentCameraFallback } from "@/components/document-camera-fallback"
import { ScanIcon, AlertCircle, FileText, Camera, Image } from "lucide-react"

export default function DocumentScannerApp() {
  const [step, setStep] = useState<"initial" | "camera" | "processing" | "preview">("initial")
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [documentCorners, setDocumentCorners] = useState<{ x: number; y: number }[] | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [useFallback, setUseFallback] = useState(false)
  const [isBrowserCompatible, setIsBrowserCompatible] = useState(true)

  // Check browser compatibility on mount
  useEffect(() => {
    // Check if the browser supports getUserMedia
    const isMediaDevicesSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    setIsBrowserCompatible(isMediaDevicesSupported)

    if (!isMediaDevicesSupported) {
      setCameraError(
        "Seu navegador não suporta acesso à câmera. Por favor, use um navegador moderno como Chrome, Firefox ou Safari.",
      )
      setUseFallback(true)
    }
  }, [])

  const handleCameraError = (error: string) => {
    console.error("Erro de câmera:", error)
    setCameraError(error)
    setUseFallback(true)
    // Don't change step here, let the user decide what to do
  }

  const handleFallbackCancel = () => {
    setUseFallback(false)
    setStep("initial")
  }

  const handleStartScan = () => {
    setCameraError(null)
    if (!isBrowserCompatible) {
      setUseFallback(true)
    }
    setStep("camera")
  }

  const handleCapture = (imageUri: string, corners: { x: number; y: number }[]) => {
    setCapturedImage(imageUri)
    setDocumentCorners(corners)
    setStep("processing")
  }

  const handleProcessingComplete = (processedImageUri: string) => {
    setProcessedImage(processedImageUri)
    setStep("preview")
  }

  const handleReset = () => {
    setCapturedImage(null)
    setProcessedImage(null)
    setDocumentCorners(null)
    setUseFallback(false)
    setCameraError(null)
    setStep("initial")
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md">
        {step === "initial" && (
          <div className="flex flex-col items-center p-8 space-y-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg m-4">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
              <ScanIcon className="h-10 w-10 text-primary" />
            </div>

            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">Digitalizador de Documentos</h1>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm">
                Digitalize documentos com detecção automática e correção de perspectiva
              </p>
            </div>

            <Button size="lg" onClick={handleStartScan} className="w-full">
              Iniciar Digitalização
            </Button>

            {!isBrowserCompatible && (
              <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg text-amber-700 dark:text-amber-400 text-sm flex items-start gap-2">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Câmera não suportada</p>
                  <p>Seu navegador não suporta acesso à câmera. Você ainda pode fazer upload de imagens manualmente.</p>
                </div>
              </div>
            )}

            <div className="w-full pt-6">
              <h3 className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">Como funciona</h3>
              <div className="grid grid-cols-3 gap-4 w-full">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-2">
                    <Camera className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Posicione o documento</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-2">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Detecção automática</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-2">
                    <Image className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Documento perfeito</span>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h4 className="font-medium text-blue-700 dark:text-blue-400 text-sm mb-2">
                  Dicas para melhor resultado:
                </h4>
                <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
                  <li>Posicione o documento em uma superfície plana com boa iluminação</li>
                  <li>Evite sombras e reflexos no documento</li>
                  <li>Mantenha a câmera estável durante a captura</li>
                  <li>Aguarde a detecção automática ou toque para capturar</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {step === "initial" && cameraError && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 text-sm flex items-start gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Erro de Câmera</p>
              <p>{cameraError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setCameraError(null)
                  handleStartScan()
                }}
              >
                Tentar Novamente
              </Button>
            </div>
          </div>
        )}

        {step === "camera" && !useFallback && (
          <div className="overflow-hidden rounded-2xl shadow-lg m-4">
            <DocumentCamera
              key={`camera-instance-${Date.now()}`} // Add key to force re-render
              onCapture={handleCapture}
              onError={handleCameraError}
            />
          </div>
        )}

        {step === "camera" && useFallback && (
          <div className="overflow-hidden rounded-2xl shadow-lg m-4">
            <DocumentCameraFallback onCapture={handleCapture} onCancel={handleFallbackCancel} />
          </div>
        )}

        {step === "processing" && capturedImage && documentCorners && (
          <div className="overflow-hidden rounded-2xl shadow-lg bg-white dark:bg-gray-800 m-4">
            <ImageProcessing
              imageUri={capturedImage}
              documentCorners={documentCorners}
              onProcessingComplete={handleProcessingComplete}
            />
          </div>
        )}

        {step === "preview" && processedImage && (
          <div className="overflow-hidden rounded-2xl shadow-lg bg-white dark:bg-gray-800 m-4">
            <DocumentPreview imageUri={processedImage} onReset={handleReset} />
          </div>
        )}
      </div>
    </div>
  )
}

