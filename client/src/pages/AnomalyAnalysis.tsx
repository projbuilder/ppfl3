import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Upload,
  Eye, 
  Shield, 
  Activity,
  AlertTriangle,
  CheckCircle,
  Camera,
  Target,
  Clock,
  Download,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useDropzone } from 'react-dropzone';
import { useToast } from '@/hooks/use-toast';

interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: 'uploaded' | 'processing' | 'analyzed' | 'error';
  analysisResults?: AnomalyResult;
  uploadedAt: string;
  imageUrl?: string;
}

interface AnomalyResult {
  anomalyDetected: boolean;
  anomalyType: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'uncertain';
  confidence: number;
  description: string;
  modelUsed: string;
  processingTime: number;
  recommendedAction?: 'manual_review' | 'alert' | 'none';
  bounding_boxes?: Array<{
    class_name: string;
    confidence: number;
    bbox: [number, number, number, number];
    is_anomaly: boolean;
    priority: string;
  }>;
  metadata: {
    fileType: string;
    analysisMethod: string;
    source: string;
    timestamp: string;
    confidenceThreshold?: number;
    privacy_impact: {
      epsilon: number;
      delta: number;
    };
  };
}

interface AIServiceStatus {
  status: string;
  timesformerAvailable?: boolean;
  yoloAvailable?: boolean;
  fusionEngine?: boolean;
  version?: string;
}

export default function AnomalyAnalysis() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedResult, setSelectedResult] = useState<AnomalyResult | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  // Query AI service status
  const { data: aiStatus } = useQuery({
    queryKey: ['/api/ai/status'],
    refetchInterval: 10000 // Check every 10 seconds
  });

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploadedBy', 'user');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const uploadedFile: UploadedFile = await response.json();
      setUploadedFiles(prev => [...prev, uploadedFile]);

      // Start polling for analysis results
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch('/api/uploads');
          const files: UploadedFile[] = await statusResponse.json();
          const currentFile = files.find((f: UploadedFile) => f.id === uploadedFile.id);

          if (currentFile && currentFile.status !== 'uploaded' && currentFile.status !== 'processing') {
            setUploadedFiles(prev =>
              prev.map(f => f.id === uploadedFile.id ? currentFile : f)
            );

            if (currentFile.status === 'analyzed' && currentFile.analysisResults) {
              setSelectedResult(currentFile.analysisResults);
            }

            clearInterval(pollInterval);

            if (currentFile.status === 'analyzed') {
              toast({
                title: "Analysis Complete",
                description: currentFile.analysisResults?.anomalyDetected
                  ? `${currentFile.analysisResults.anomalyType} detected with ${(currentFile.analysisResults.confidence * 100).toFixed(1)}% confidence`
                  : "No anomalies detected",
                variant: currentFile.analysisResults?.anomalyDetected ? "destructive" : "default",
              });
            }
          }
        } catch (error) {
          console.error('Failed to fetch analysis results:', error);
          clearInterval(pollInterval);
        }
      }, 2000);

      // Stop polling after 60 seconds
      setTimeout(() => clearInterval(pollInterval), 60000);

      toast({
        title: "File Uploaded",
        description: `${file.name} uploaded successfully. Analysis in progress...`,
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      // Check file size (50MB limit)
      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please upload files smaller than 50MB",
          variant: "destructive",
        });
        return;
      }

      // Check file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'video/mp4', 'video/avi', 'video/mov', 'video/mkv'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please upload images (JPEG, PNG, GIF) or videos (MP4, AVI, MOV, MKV)",
          variant: "destructive",
        });
        return;
      }

      uploadFile(file);
    });
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif'],
      'video/*': ['.mp4', '.avi', '.mov', '.mkv']
    },
    maxFiles: 5,
    multiple: true
  });

  const getSeverityColor = (severity: string | undefined) => {
    if (!severity) return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    
    switch (severity.toLowerCase()) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'uncertain': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const downloadProcessedImage = async (file: any, analysisResults: any) => {
    try {
      if (!file || !file.filename) {
        throw new Error('File information not available');
      }

      const isVideo = file.mimeType?.startsWith('video/');
      
      if (isVideo) {
        // For videos, download original video and metadata
        try {
          const videoResponse = await fetch(`/uploads/${file.filename}`);
          if (!videoResponse.ok) {
            throw new Error('Failed to fetch video file');
          }
          
          const videoBlob = await videoResponse.blob();
          const videoUrl = URL.createObjectURL(videoBlob);
          const a = document.createElement('a');
          a.href = videoUrl;
          a.download = `processed_video_${file.originalName}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(videoUrl);
          
          // Download analysis metadata as JSON
          const metadata = {
            originalFile: file.originalName,
            analysisResults: analysisResults,
            timestamp: new Date().toISOString(),
            boundingBoxes: analysisResults.bounding_boxes || []
          };
          
          const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
          const metadataUrl = URL.createObjectURL(metadataBlob);
          const metadataLink = document.createElement('a');
          metadataLink.href = metadataUrl;
          metadataLink.download = `analysis_${file.originalName.replace(/\.[^/.]+$/, "")}.json`;
          document.body.appendChild(metadataLink);
          metadataLink.click();
          document.body.removeChild(metadataLink);
          URL.revokeObjectURL(metadataUrl);
          
          toast({
            title: "Video Downloaded",
            description: "Video and analysis metadata downloaded successfully",
          });
        } catch (error) {
          console.error('Video download error:', error);
          toast({
            title: "Download Failed",
            description: "Could not download video file",
            variant: "destructive",
          });
        }
        return;
      }

      // For images, create canvas with bounding boxes
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      // Load the original image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => {
          console.error('Image load error:', e);
          reject(new Error('Failed to load image for processing'));
        };
        
        // Try to load image with absolute URL
        img.src = `${window.location.origin}/uploads/${file.filename}`;
      });

      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw the original image
      ctx.drawImage(img, 0, 0);
      
      // Draw bounding boxes if available
      if (analysisResults.bounding_boxes && analysisResults.bounding_boxes.length > 0) {
        analysisResults.bounding_boxes.forEach((bbox: any) => {
          if (!bbox.bbox || bbox.bbox.length !== 4) return;
          
          const [x1, y1, x2, y2] = bbox.bbox;
          const width = Math.abs(x2 - x1);
          const height = Math.abs(y2 - y1);
          
          // Use bbox coordinates directly if they seem to be in pixel coordinates
          // Otherwise scale them
          let scaledX1 = x1;
          let scaledY1 = y1;
          let scaledWidth = width;
          let scaledHeight = height;
          
          if (x2 <= 1 && y2 <= 1) {
            // Coordinates are normalized (0-1), scale to image size
            scaledX1 = x1 * canvas.width;
            scaledY1 = y1 * canvas.height;
            scaledWidth = width * canvas.width;
            scaledHeight = height * canvas.height;
          } else if (x2 <= 640 && y2 <= 480) {
            // Coordinates are in standard detection resolution, scale to image size
            const scaleX = canvas.width / 640;
            const scaleY = canvas.height / 480;
            scaledX1 = x1 * scaleX;
            scaledY1 = y1 * scaleY;
            scaledWidth = width * scaleX;
            scaledHeight = height * scaleY;
          }
          
          // Ensure coordinates are within canvas bounds
          scaledX1 = Math.max(0, Math.min(canvas.width - 1, scaledX1));
          scaledY1 = Math.max(0, Math.min(canvas.height - 1, scaledY1));
          scaledWidth = Math.min(canvas.width - scaledX1, scaledWidth);
          scaledHeight = Math.min(canvas.height - scaledY1, scaledHeight);
          
          // Set colors based on anomaly type
          const color = bbox.is_anomaly ? '#ef4444' : '#22c55e';
          
          // Draw bounding box
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(2, Math.min(canvas.width, canvas.height) / 200);
          ctx.strokeRect(scaledX1, scaledY1, scaledWidth, scaledHeight);
          
          // Draw label
          ctx.fillStyle = color;
          const fontSize = Math.max(12, Math.min(canvas.width, canvas.height) / 40);
          ctx.font = `bold ${fontSize}px Arial`;
          const label = `${bbox.class_name} (${(bbox.confidence * 100).toFixed(0)}%)`;
          const labelMetrics = ctx.measureText(label);
          const labelWidth = labelMetrics.width;
          const labelHeight = fontSize;
          
          // Position label above the box, or below if near top
          const labelY = scaledY1 > labelHeight + 8 ? scaledY1 - 4 : scaledY1 + scaledHeight + labelHeight + 4;
          
          // Draw label background
          ctx.fillRect(scaledX1, labelY - labelHeight - 4, labelWidth + 8, labelHeight + 8);
          
          // Draw label text
          ctx.fillStyle = 'white';
          ctx.fillText(label, scaledX1 + 4, labelY - 4);
        });
      }
      
      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        if (!blob) {
          throw new Error('Failed to create image blob');
        }
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `annotated_${analysisResults.anomalyType || 'analysis'}_${file.originalName}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast({
          title: "Image Downloaded",
          description: "Annotated image downloaded successfully",
        });
      }, 'image/jpeg', 0.9);
      
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Could not process file for download",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploaded':
      case 'processing':
        return <Clock className="w-4 h-4 text-blue-400" />;
      case 'analyzed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
      default:
        return <Upload className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Camera className="h-6 w-6 text-blue-400" />
              Upload & Analyze
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Upload surveillance footage or images for enhanced anomaly detection
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Shield className="h-4 w-4 text-green-400" />
            <span className="text-xs text-green-400 font-medium">Privacy-Preserving</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-screen">
        {/* Left Panel - Upload Section */}
        <div className="w-1/2 p-6 border-r border-slate-800">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white font-semibold">
                AI-Powered Anomaly Detection
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Upload Zone */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-blue-400 bg-blue-400/10'
                    : 'border-slate-600 hover:border-blue-400/50'
                }`}
                data-testid="file-upload-dropzone"
              >
                <input {...getInputProps()} data-testid="file-upload-input" />
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" data-testid="upload-icon" />
                {isDragActive ? (
                  <p className="text-blue-400">Drop files here...</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-slate-300 font-medium">
                      Drag & drop surveillance files here, or click to select
                    </p>
                    <p className="text-sm text-slate-500">
                      Supports images (JPEG, PNG, GIF) and videos (MP4, AVI, MOV, MKV) up to 50MB
                    </p>
                  </div>
                )}
              </div>

              {isUploading && (
                <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="animate-spin rounded-full h-4 w-4 border border-blue-400 border-t-transparent"></div>
                    <span className="text-sm text-slate-300">Uploading and analyzing...</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis Results List */}
          {uploadedFiles.length > 0 && (
            <Card className="bg-slate-900/50 border-slate-800 mt-6">
              <CardHeader>
                <CardTitle className="text-white font-semibold text-lg">
                  Analysis Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {uploadedFiles.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => {
                      if (file.analysisResults) {
                        setSelectedResult(file.analysisResults);
                        setSelectedFileId(file.id);
                      }
                    }}
                    className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                      file.analysisResults?.anomalyDetected
                        ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                        : file.status === 'analyzed'
                        ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(file.status)}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">
                            {file.originalName}
                          </p>
                          <p className="text-xs text-slate-400">
                            {(file.size / (1024 * 1024)).toFixed(1)} MB
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        {file.analysisResults?.anomalyDetected && (
                          <Badge className={`mb-1 text-xs ${
                            file.analysisResults.severity === 'critical' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            file.analysisResults.severity === 'uncertain' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
                            'bg-orange-500/20 text-orange-400 border-orange-500/30'
                          }`}>
                            {file.analysisResults.anomalyType.replace('_', ' ')} {file.analysisResults.severity === 'uncertain' ? '(uncertain)' : 'detected'}
                          </Badge>
                        )}
                        {file.analysisResults && (
                          <div className="flex flex-col items-end gap-1">
                            <Badge className={getSeverityColor(file.analysisResults.severity)}>
                              {(file.analysisResults.confidence * 100).toFixed(1)}%
                            </Badge>
                            {file.analysisResults.recommendedAction && (
                              <span className="text-xs text-slate-400">
                                {file.analysisResults.recommendedAction === 'manual_review' ? 'Review needed' : ''}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel - Results Section */}
        <div className="w-1/2 p-6">
          <Card className="bg-slate-900/50 border-slate-800 h-full">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Analysis Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedResult ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Eye className="h-16 w-16 mb-4 opacity-30" />
                  <p className="text-lg font-medium">Upload and analyze content to see results</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Overall Status */}
                  <div className={`p-4 rounded-lg border ${
                    selectedResult.anomalyDetected 
                      ? 'bg-red-500/10 border-red-500/30' 
                      : 'bg-green-500/10 border-green-500/30'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {selectedResult.anomalyDetected ? (
                          <AlertTriangle className="h-6 w-6 text-red-400" />
                        ) : (
                          <CheckCircle className="h-6 w-6 text-green-400" />
                        )}
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            {selectedResult.anomalyDetected ? selectedResult.anomalyType : 'No Anomaly'}
                          </h3>
                          <p className="text-sm text-slate-400">
                            {selectedResult.description}
                          </p>
                        </div>
                      </div>
                      <Badge className={getSeverityColor(selectedResult.severity)}>
                        {selectedResult.severity.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  {/* Detection Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Confidence</p>
                      <p className="text-lg font-mono text-white">
                        {(selectedResult.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Model Used</p>
                      <div className="flex items-center space-x-2">
                        <Target className="h-4 w-4 text-blue-400" />
                        <p className="text-sm text-white">{selectedResult.modelUsed}</p>
                      </div>
                    </div>
                  </div>

                  {/* Image Visualization with Bounding Boxes */}
                  {selectedResult.bounding_boxes && selectedResult.bounding_boxes.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-sm font-medium text-white">Visual Detection Results</h4>
                      <div className="relative bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                        <div className="relative inline-block">
                          {/* Display actual uploaded image/video */}
                          <div className="w-full h-64 bg-slate-700 rounded-lg relative overflow-hidden">
                            {(() => {
                              const file = uploadedFiles.find((f: any) => f.id === selectedFileId);
                              if (!file) {
                                return (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Camera className="w-16 h-16 text-slate-500" />
                                    <span className="text-slate-400 ml-3">No file selected</span>
                                  </div>
                                );
                              }

                              const fileUrl = `/uploads/${file.filename}`;
                              const isVideo = file.mimeType?.startsWith('video/');
                              
                              return isVideo ? (
                                <video 
                                  key={file.id}
                                  src={fileUrl}
                                  controls
                                  className="w-full h-full object-contain"
                                  onError={(e) => {
                                    console.error('Failed to load video:', fileUrl, e);
                                  }}
                                  onLoadedData={() => console.log('Video loaded successfully:', fileUrl)}
                                />
                              ) : (
                                <img 
                                  key={file.id}
                                  src={fileUrl}
                                  alt="Uploaded content"
                                  className="w-full h-full object-contain"
                                  onError={(e) => {
                                    console.error('Failed to load image:', fileUrl, e);
                                  }}
                                  onLoad={() => console.log('Image loaded successfully:', fileUrl)}
                                />
                              );
                            })()}
                            
                            {/* Overlay bounding boxes */}
                            {(() => {
                              const file = uploadedFiles.find((f: any) => f.id === selectedFileId);
                              if (!file || !selectedResult.bounding_boxes) return null;
                              
                              return selectedResult.bounding_boxes.map((bbox: any, index: number) => {
                                const [x1, y1, x2, y2] = bbox.bbox;
                                const boxWidth = Math.abs(x2 - x1);
                                const boxHeight = Math.abs(y2 - y1);
                                
                                // Smart bounding box positioning based on coordinate system detection
                                let leftPercent, topPercent, widthPercent, heightPercent;
                                
                                if (x2 <= 1 && y2 <= 1) {
                                  // Normalized coordinates (0-1)
                                  leftPercent = Math.max(0, Math.min(100, x1 * 100));
                                  topPercent = Math.max(0, Math.min(100, y1 * 100));
                                  widthPercent = Math.max(1, Math.min(100 - leftPercent, boxWidth * 100));
                                  heightPercent = Math.max(1, Math.min(100 - topPercent, boxHeight * 100));
                                } else {
                                  // Pixel coordinates - use reasonable assumptions for scaling
                                  const assumedWidth = Math.max(640, x2, x1 + boxWidth);
                                  const assumedHeight = Math.max(480, y2, y1 + boxHeight);
                                  leftPercent = Math.max(0, Math.min(100, (x1 / assumedWidth) * 100));
                                  topPercent = Math.max(0, Math.min(100, (y1 / assumedHeight) * 100));
                                  widthPercent = Math.max(1, Math.min(100 - leftPercent, (boxWidth / assumedWidth) * 100));
                                  heightPercent = Math.max(1, Math.min(100 - topPercent, (boxHeight / assumedHeight) * 100));
                                }
                                
                                return (
                                  <div
                                    key={index}
                                    className={`absolute border-2 ${
                                      bbox.is_anomaly ? 'border-red-500 bg-red-500/10' : 'border-green-500 bg-green-500/10'
                                    } rounded pointer-events-none`}
                                    data-testid={`bounding-box-${index}`}
                                    style={{
                                      left: `${leftPercent}%`,
                                      top: `${topPercent}%`,
                                      width: `${widthPercent}%`,
                                      height: `${heightPercent}%`,
                                    }}
                                  >
                                    <div 
                                      className={`absolute -top-6 left-0 px-2 py-1 text-xs rounded whitespace-nowrap ${
                                        bbox.is_anomaly 
                                          ? 'bg-red-500 text-white' 
                                          : 'bg-green-500 text-white'
                                      }`}
                                      data-testid={`bbox-label-${index}`}
                                    >
                                      {bbox.class_name} ({(bbox.confidence * 100).toFixed(0)}%)
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                        
                        {/* Legend and Download */}
                        <div className="mt-4 flex items-center justify-between">
                          <div className="flex items-center gap-4 text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 border-2 border-red-500"></div>
                              <span className="text-red-400">Anomaly Detected</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 border-2 border-green-500"></div>
                              <span className="text-green-400">Normal Object</span>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const file = uploadedFiles.find((f: any) => f.id === selectedFileId);
                              if (file && selectedResult) {
                                downloadProcessedImage(file, selectedResult);
                              }
                            }}
                            disabled={!selectedFileId || !selectedResult}
                            className="flex items-center gap-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs rounded transition-colors"
                            data-testid="download-annotated-button"
                          >
                            <Download className="w-3 h-3" />
                            Download Annotated
                          </button>
                        </div>
                      </div>

                      {/* Detailed Bounding Box Info */}
                      <div className="space-y-2">
                        <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Detection Details</h5>
                        {selectedResult.bounding_boxes.map((bbox, index) => (
                          <div key={index} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-white">{bbox.class_name}</span>
                              <div className="flex space-x-2">
                                <Badge variant={bbox.is_anomaly ? "destructive" : "secondary"}>
                                  {bbox.priority}
                                </Badge>
                                <Badge variant="outline">
                                  {(bbox.confidence * 100).toFixed(1)}%
                                </Badge>
                              </div>
                            </div>
                            <div className="text-xs text-slate-400 space-y-1">
                              <p>Coordinates: [{bbox.bbox.join(', ')}]</p>
                              <p>Risk Level: {bbox.is_anomaly ? 'HIGH' : 'LOW'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* JSON Metadata */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-white">Privacy & Metadata</h4>
                    <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap">
{JSON.stringify({
  anomaly: selectedResult.anomalyType,
  confidence: selectedResult.confidence,
  bounding_boxes: selectedResult.bounding_boxes || [],
  timestamp: selectedResult.metadata.timestamp,
  privacy_impact: selectedResult.metadata.privacy_impact,
  processing_time: `${selectedResult.processingTime}ms`
}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}