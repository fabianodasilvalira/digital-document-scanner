"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Download, Share2, Trash2, Copy, Printer, ZoomIn, ZoomOut, RotateCw, Maximize, Minimize } from "lucide-react"

interface DocumentPreviewProps {
  imageUri: string
  onReset: () => void
}

export function DocumentPreview({ imageUri, onReset }: DocumentPreviewProps) {
  const [activeTab, setActiveTab] = useState("preview")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [fitToScreen, setFitToScreen] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  // Auto-adjust zoom level when image loads or container size changes
  useEffect(() => {
    const adjustZoom = () => {
      if (!containerRef.current || !imageRef.current || !fitToScreen) return

      const container = containerRef.current
      const image = imageRef.current

      // Wait for image to load
      if (image.naturalWidth === 0 || image.naturalHeight === 0) return

      // Calculate container dimensions (accounting for padding)
      const containerWidth = container.clientWidth - 32 // 16px padding on each side
      const containerHeight = container.clientHeight - 32

      // Calculate zoom level to fit image in container
      const widthRatio = containerWidth / image.naturalWidth
      const heightRatio = containerHeight / image.naturalHeight

      // Use the smaller ratio to ensure image fits completely
      const newZoom = Math.min(widthRatio, heightRatio, 1) // Cap at 100%

      setZoomLevel(newZoom)
    }

    // Adjust zoom when image loads
    if (imageRef.current) {
      imageRef.current.onload = adjustZoom
    }

    // Adjust zoom when window resizes
    window.addEventListener("resize", adjustZoom)

    // Initial adjustment
    adjustZoom()

    return () => {
      window.removeEventListener("resize", adjustZoom)
    }
  }, [imageUri, fitToScreen, activeTab])

  const handleDownload = () => {
    const link = document.createElement("a")
    link.href = imageUri
    link.download = `documento-digitalizado-${new Date().getTime()}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        // Convert data URL to Blob
        const response = await fetch(imageUri)
        const blob = await response.blob()

        await navigator.share({
          files: [new File([blob], "documento-digitalizado.jpg", { type: "image/jpeg" })],
          title: "Documento Digitalizado",
        })
      } catch (error) {
        console.error("Erro ao compartilhar:", error)
      }
    } else {
      alert("API de compartilhamento não suportada neste navegador")
    }
  }

  const handleCopy = () => {
    // In a real app, this would copy the image to clipboard
    navigator.clipboard
      .writeText("Documento copiado para a área de transferência")
      .then(() => {
        alert("Documento copiado para a área de transferência")
      })
      .catch((err) => {
        console.error("Erro ao copiar documento: ", err)
      })
  }

  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Imprimir Documento</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
              img { max-width: 100%; max-height: 100vh; object-fit: contain; }
            </style>
          </head>
          <body>
            <img src="${imageUri}" alt="Documento digitalizado" />
            <script>
              window.onload = function() { window.print(); window.close(); }
            </script>
          </body>
        </html>
      `)
      printWindow.document.close()
    }
  }

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
    // Reset zoom when toggling fullscreen
    setFitToScreen(true)
  }

  const zoomIn = () => {
    setZoomLevel((prev) => {
      const newZoom = Math.min(prev + 0.25, 3)
      setFitToScreen(false)
      return newZoom
    })
  }

  const zoomOut = () => {
    setZoomLevel((prev) => {
      const newZoom = Math.max(prev - 0.25, 0.25)
      setFitToScreen(false)
      return newZoom
    })
  }

  const rotate = () => {
    setRotation((prev) => (prev + 90) % 360)
  }

  const toggleFitToScreen = () => {
    setFitToScreen(!fitToScreen)
  }

  // Function to apply filters based on the active tab
  const getImageStyle = (mode: string) => {
    const baseStyle = {
      transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
      transformOrigin: "center center",
      maxHeight: fitToScreen ? "100%" : "none",
      maxWidth: fitToScreen ? "100%" : "none",
      height: fitToScreen ? "auto" : "auto",
      width: fitToScreen ? "auto" : "auto",
      objectFit: "contain" as const,
      transition: "transform 200ms ease",
    }

    switch (mode) {
      case "grayscale":
        return {
          ...baseStyle,
          filter: "grayscale(100%) brightness(105%) contrast(105%)",
        }
      case "bw":
        return {
          ...baseStyle,
          filter: "grayscale(100%) contrast(150%) brightness(110%)",
        }
      default:
        return baseStyle
    }
  }

  return (
    <div className={`flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-white dark:bg-gray-900" : "h-[600px]"}`}>
      <div className="px-4 pt-4 flex justify-between items-center border-b pb-2">
        <h2 className="text-xl font-semibold">Visualização do Documento</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFitToScreen}
            title={fitToScreen ? "Tamanho real" : "Ajustar à tela"}
          >
            {fitToScreen ? "Tamanho real" : "Ajustar à tela"}
          </Button>
          <Button variant="outline" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-4 w-4 mr-2" /> : <Maximize className="h-4 w-4 mr-2" />}
            {isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="preview" className="w-full h-full flex flex-col">
        <div className="px-4 pt-2">
          <TabsList className="w-full">
            <TabsTrigger value="preview" className="flex-1" onClick={() => setActiveTab("preview")}>
              Colorido
            </TabsTrigger>
            <TabsTrigger value="grayscale" className="flex-1" onClick={() => setActiveTab("grayscale")}>
              Tons de Cinza
            </TabsTrigger>
            <TabsTrigger value="bw" className="flex-1" onClick={() => setActiveTab("bw")}>
              P&B
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex justify-center gap-2 mt-2 px-4 py-2 border-b">
          <Button variant="outline" size="sm" onClick={zoomOut} disabled={zoomLevel <= 0.25}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="py-1 px-2 text-sm">{Math.round(zoomLevel * 100)}%</span>
          <Button variant="outline" size="sm" onClick={zoomIn} disabled={zoomLevel >= 3}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={rotate}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="preview" className="h-full m-0">
            <div ref={containerRef} className="h-full w-full overflow-auto p-4 flex items-center justify-center">
              <img
                ref={imageRef}
                src={imageUri || "/placeholder.svg"}
                alt="Documento digitalizado"
                style={getImageStyle("preview")}
                className="rounded-md"
              />
            </div>
          </TabsContent>

          <TabsContent value="grayscale" className="h-full m-0">
            <div className="h-full w-full overflow-auto p-4 flex items-center justify-center">
              <img
                src={imageUri || "/placeholder.svg"}
                alt="Documento em tons de cinza"
                style={getImageStyle("grayscale")}
                className="rounded-md"
              />
            </div>
          </TabsContent>

          <TabsContent value="bw" className="h-full m-0">
            <div className="h-full w-full overflow-auto p-4 flex items-center justify-center">
              <img
                src={imageUri || "/placeholder.svg"}
                alt="Documento em preto e branco"
                style={getImageStyle("bw")}
                className="rounded-md"
              />
            </div>
          </TabsContent>
        </div>

        <div className="p-4 border-t">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={onReset} className="rounded-full">
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleCopy} className="rounded-full">
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="icon" onClick={handlePrint} className="rounded-full">
                <Printer className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleShare} className="rounded-full">
                <Share2 className="h-4 w-4" />
              </Button>
              <Button onClick={handleDownload} className="rounded-full">
                <Download className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  )
}

