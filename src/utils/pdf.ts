import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

async function waitForImages(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    })
  );
}

export async function downloadElementAsPdf(
  element: HTMLElement,
  filename: string,
  options?: { maxWidthMm?: number }
): Promise<void> {
  await waitForImages(element);
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  const canvas = await html2canvas(element, {
    scale: 2.5,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const marginMm = 12;
  const maxContentWidthMm = Math.min(options?.maxWidthMm ?? pageWidthMm - marginMm * 2, pageWidthMm - marginMm * 2);
  const usableHeightMm = pageHeightMm - marginMm * 2;

  // Scale to fit maxContentWidthMm (and also shrink if it just slightly overflows? No, paginate cleanly if multi-page)
  const renderWidthMm = maxContentWidthMm;
  const renderHeightMm = (canvas.height * renderWidthMm) / canvas.width;
  const xOffset = (pageWidthMm - renderWidthMm) / 2;

  if (renderHeightMm <= usableHeightMm) {
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', xOffset, marginMm, renderWidthMm, renderHeightMm, undefined, 'FAST');
  } else {
    const sliceHeightPx = Math.floor((usableHeightMm / renderWidthMm) * canvas.width);
    let offsetY = 0;
    let pageIndex = 0;

    while (offsetY < canvas.height) {
      const currentSliceHeightPx = Math.min(sliceHeightPx, canvas.height - offsetY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = currentSliceHeightPx;

      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          offsetY,
          canvas.width,
          currentSliceHeightPx,
          0,
          0,
          canvas.width,
          currentSliceHeightPx
        );
      }

      if (pageIndex > 0) {
        pdf.addPage();
      }
      const sliceHeightMm = (currentSliceHeightPx * renderWidthMm) / canvas.width;
      const pageImgData = pageCanvas.toDataURL('image/png');
      pdf.addImage(pageImgData, 'PNG', xOffset, marginMm, renderWidthMm, sliceHeightMm, undefined, 'FAST');

      offsetY += currentSliceHeightPx;
      pageIndex += 1;
    }
  }

  const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  pdf.save(safeFilename);
}

export async function downloadCardPagesAsPdf(
  elements: HTMLElement[],
  filename: string
): Promise<void> {
  if (!elements.length) return;
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  let pdf: jsPDF | null = null;
  const pageWidthMm = 86;
  let uniformHeightMm = 139.5;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    await waitForImages(el);
    const canvas = await html2canvas(el, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    if (i === 0) {
      uniformHeightMm = Math.round(((canvas.height * pageWidthMm) / canvas.width) * 10) / 10;
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pageWidthMm, uniformHeightMm],
      });
    } else if (pdf) {
      pdf.addPage([pageWidthMm, uniformHeightMm], 'portrait');
    }

    if (pdf) {
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidthMm, uniformHeightMm, undefined, 'FAST');
    }
  }

  if (pdf) {
    const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(safeFilename);
  }
}
