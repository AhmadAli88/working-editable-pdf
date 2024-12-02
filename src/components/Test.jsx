import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const PDFViewer = ({ pdfUrl = '../src/assets/test.pdf' }) => {
  // Refs and State Management
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // PDF-related states
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.5);

  // Annotation-related states
  const [annotations, setAnnotations] = useState([]);
  const [currentTool, setCurrentTool] = useState('select');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [highlightInfo, setHighlightInfo] = useState(null);

  // Error and UI states
  const [error, setError] = useState(null);
  const [annotationColor, setAnnotationColor] = useState('#FFFF00');

  // PDF Loading Effect
  useEffect(() => {
    const loadPDF = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        renderPage(1, pdf);
      } catch (error) {
        console.error('Error loading PDF:', error);
        setError('Failed to load PDF. Please check the file path.');
      }
    };
    loadPDF();
  }, [pdfUrl]);

  const renderPage = async (pageNumber, pdfDocument = pdfDoc) => {
    if (!pdfDocument) return;

    const page = await pdfDocument.getPage(pageNumber);
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    const viewport = page.getViewport({ scale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // First render the PDF page text and images
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    await page.render(renderContext).promise;

    // Then render annotations on top with proper opacity
    renderAnnotations();
  };

  const renderAnnotations = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Get page-specific annotations
    const pageAnnotations = annotations.filter((a) => a.page === pageNum);

    // Save the current context state
    context.save();

    // Set global composite operation for highlights
    context.globalCompositeOperation = 'multiply';

    // 1. Render highlights with proper opacity
    pageAnnotations.forEach((annotation) => {
      if (annotation.type === 'highlight') {
        context.save();
        context.globalAlpha = 0.35; // Adjust this value for highlight transparency
        renderHighlight(context, annotation);
        context.restore();
      }
    });

    // Reset composite operation for other annotations
    context.globalCompositeOperation = 'source-over';

    // 2. Render drawings
    pageAnnotations.forEach((annotation) => {
      if (annotation.type === 'draw') {
        renderDrawing(context, annotation);
      }
    });

    // 3. Render text annotations
    pageAnnotations.forEach((annotation) => {
      if (annotation.type === 'text') {
        renderTextAnnotation(context, annotation);
      }
    });

    // Render current drawing or highlight in progress
    if (currentTool === 'draw' && currentPath.length > 1) {
      renderCurrentDrawing(context);
    }
    if (currentTool === 'highlight' && highlightInfo) {
      context.save();
      context.globalCompositeOperation = 'multiply';
      context.globalAlpha = 0.35;
      renderCurrentHighlight(context);
      context.restore();
    }

    // Restore the original context state
    context.restore();
  };

  const renderHighlight = (context, annotation) => {
    const { start, end } = annotation;
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    context.fillStyle = annotation.color;
    context.fillRect(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      width,
      height
    );
  };

  const renderDrawing = (context, annotation) => {
    context.beginPath();
    context.strokeStyle = annotation.color;
    context.lineWidth = annotation.width;
    annotation.points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
  };

  const renderTextAnnotation = (context, annotation) => {
    context.font = '16px Arial';
    context.fillStyle = annotation.color;
    context.fillText(
      annotation.text,
      annotation.position.x,
      annotation.position.y
    );
  };

  const renderCurrentDrawing = (context) => {
    context.beginPath();
    context.strokeStyle = annotationColor;
    context.lineWidth = 2;
    currentPath.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
  };

  const renderCurrentHighlight = (context) => {
    context.fillStyle = annotationColor;
    const { start, current } = highlightInfo;
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    context.fillRect(
      Math.min(start.x, current.x),
      Math.min(start.y, current.y),
      width,
      height
    );
  };

  // Mouse Event Handlers
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    switch (currentTool) {
      case 'draw':
        setIsDrawing(true);
        setCurrentPath([{ x, y }]);
        break;
      case 'highlight':
        setHighlightInfo({
          start: { x, y },
          current: { x, y },
        });
        break;
      case 'text':
        handleTextAnnotation(x, y);
        break;
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentTool === 'draw' && isDrawing) {
      setCurrentPath((prev) => [...prev, { x, y }]);
      renderAnnotations();
    }

    if (currentTool === 'highlight' && highlightInfo) {
      setHighlightInfo((prev) => ({
        ...prev,
        current: { x, y },
      }));
      renderAnnotations();
    }
  };

  const handleMouseUp = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentTool === 'draw' && isDrawing) {
      const newAnnotation = {
        type: 'draw',
        page: pageNum,
        points: currentPath,
        color: annotationColor,
        width: 2,
      };
      setAnnotations((prev) => [...prev, newAnnotation]);
      setIsDrawing(false);
      setCurrentPath([]);
    }

    if (currentTool === 'highlight' && highlightInfo) {
      const newAnnotation = {
        type: 'highlight',
        page: pageNum,
        start: highlightInfo.start,
        end: { x, y },
        color: annotationColor,
      };
      setAnnotations((prev) => [...prev, newAnnotation]);
      setHighlightInfo(null);
    }

    renderAnnotations();
  };

  const handleTextAnnotation = (x, y) => {
    const text = prompt('Enter annotation text:');
    if (text) {
      const newAnnotation = {
        type: 'text',
        page: pageNum,
        position: { x, y },
        text: text,
        color: annotationColor,
      };
      setAnnotations((prev) => [...prev, newAnnotation]);
      renderAnnotations();
    }
  };

  // Utility Functions
  const clearAllAnnotations = () => {
    setAnnotations([]);
    renderPage(pageNum);
  };

  const hexToRgb = (hex) => {
    // Remove the # if present
    hex = hex.replace('#', '');

    // Parse the hex values directly to RGB values between 0 and 1
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    return { r, g, b };
  };

  const downloadAnnotatedPDF = async () => {
    try {
      // Fetch the original PDF
      const existingPdfBytes = await fetch(pdfUrl).then((res) =>
        res.arrayBuffer()
      );
      const pdfDoc = await PDFDocument.load(existingPdfBytes);

      // Get the current page
      const page = pdfDoc.getPage(pageNum - 1);

      // Add annotations to the page
      annotations
        .filter((annotation) => annotation.page === pageNum)
        .forEach((annotation) => {
          switch (annotation.type) {
            case 'highlight': {
              // Convert the user selected color to RGB
              const color = hexToRgb(annotation.color);
              page.drawRectangle({
                x: annotation.start.x,
                y: page.getHeight() - annotation.start.y,
                width: Math.abs(annotation.end.x - annotation.start.x),
                height: Math.abs(annotation.end.y - annotation.start.y),
                color: rgb(color.r, color.g, color.b), // Use exact user selected color
                opacity: 0.35,
              });
              break;
            }
            case 'text': {
              // Convert the user selected color to RGB
              const color = hexToRgb(annotation.color);
              page.drawText(annotation.text, {
                x: annotation.position.x,
                y: page.getHeight() - annotation.position.y,
                size: 16,
                color: rgb(color.r, color.g, color.b), // Use exact user selected color
              });
              break;
            }
            case 'draw': {
              // Convert the user selected color to RGB
              const color = hexToRgb(annotation.color);
              const scaledPoints = annotation.points.map(({ x, y }) => ({
                x,
                y: page.getHeight() - y,
              }));

              for (let i = 1; i < scaledPoints.length; i++) {
                const prev = scaledPoints[i - 1];
                const curr = scaledPoints[i];
                page.drawLine({
                  start: prev,
                  end: curr,
                  thickness: annotation.width,
                  color: rgb(color.r, color.g, color.b), // Use exact user selected color
                });
              }
              break;
            }
          }
        });

      const pdfBytes = await pdfDoc.save();

      // Download the PDF
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = 'annotated-document.pdf';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (error) {
      console.error('Error downloading annotated PDF:', error);
    }
  };

  return (
    <div className='w-full max-w-4xl mx-auto p-4'>
      {/* Error Display */}
      {error && (
        <div className='bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4'>
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className='mb-4 flex gap-2 flex-wrap items-center'>
        {/* Tool Selection Buttons */}
        {['highlight', 'draw', 'text'].map((tool) => (
          <button
            key={tool}
            className={`px-4 py-2 rounded ${
              currentTool === tool ? 'bg-blue-700' : 'bg-blue-500'
            } text-white hover:bg-blue-600 capitalize`}
            onClick={() => setCurrentTool(tool)}
          >
            {tool}
          </button>
        ))}

        {/* Color Picker */}
        <div className='flex items-center gap-2'>
          <label>Color:</label>
          <input
            type='color'
            value={annotationColor}
            onChange={(e) => setAnnotationColor(e.target.value)}
            className='h-10 w-16'
          />
        </div>

        {/* Utility Buttons */}
        <button
          className='px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600'
          onClick={clearAllAnnotations}
        >
          Clear All
        </button>
        <button
          className='px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600'
          onClick={downloadAnnotatedPDF}
        >
          Download PDF
        </button>
      </div>

      {/* PDF Canvas */}
      <div className='relative border border-gray-300 rounded'>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`cursor-${currentTool === 'text' ? 'text' : 'crosshair'}`}
        />
      </div>

      {/* Page Navigation */}
      <div className='mt-4 flex justify-center items-center gap-4'>
        <button
          className='px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600'
          onClick={() => {
            const newPage = pageNum - 1;
            if (newPage >= 1) {
              setPageNum(newPage);
              renderPage(newPage);
            }
          }}
          disabled={pageNum <= 1}
        >
          Previous
        </button>
        <span className='py-2'>
          Page {pageNum} of {totalPages}
        </span>
        <button
          className='px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600'
          onClick={() => {
            const newPage = pageNum + 1;
            if (newPage <= totalPages) {
              setPageNum(newPage);
              renderPage(newPage);
            }
          }}
          disabled={pageNum >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default PDFViewer;
