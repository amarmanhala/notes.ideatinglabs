import { toRichDocument } from './richDocument'
import type { TextFormat } from './textFormatting'

export type DownloadFormat = 'txt' | 'docx' | 'pdf' | 'md'

export async function createNoteDownload(text: string, formats: TextFormat[], day: string, format: DownloadFormat) {
  const filename = `notes-${day}.${format}`
  if (format === 'txt') return { filename, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) }

  if (format === 'md') {
    const { defaultMarkdownSerializer, schema } = await import('prosemirror-markdown')
    const document = toRichDocument(text, formats)
    for (const paragraph of document.content ?? []) {
      for (const run of paragraph.content ?? []) {
        run.marks = run.marks?.map(mark => ({ type: mark.type === 'bold' ? 'strong' : 'em' }))
      }
    }
    const markdown = defaultMarkdownSerializer.serialize(schema.nodeFromJSON(document))
    return { filename, blob: new Blob([markdown], { type: 'text/markdown;charset=utf-8' }) }
  }

  if (format === 'pdf') {
    const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
      import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts'),
    ])
    const paragraphs = toRichDocument(text, formats).content ?? []
    const pdf = pdfMake.createPdf({
      info: { title: `Notes · ${day}` },
      pageSize: 'A4',
      pageMargins: [48, 48, 48, 48],
      defaultStyle: { font: 'Roboto', fontSize: 15, lineHeight: 1.5, preserveLeadingSpaces: true, preserveTrailingSpaces: true },
      content: paragraphs.map(paragraph => ({
        text: paragraph.content?.length ? paragraph.content.map(run => ({
          text: (run.text ?? '').replaceAll('\t', '    '),
          bold: run.marks?.some(mark => mark.type === 'bold'),
          italics: run.marks?.some(mark => mark.type === 'italic'),
        })) : '\u00a0',
      })),
    }, undefined, undefined, fonts)
    const blob = await new Promise<Blob>(resolve => pdf.getBlob(resolve))
    return { filename, blob }
  }

  // Load Word export only when requested, keeping it out of the writing bundle.
  const { Document, Paragraph, TextRun, Tab, Packer } = await import('docx')
  const paragraphs = toRichDocument(text, formats).content ?? []
  const document = new Document({
    title: `Notes · ${day}`,
    styles: { default: { document: { run: { font: 'Arial', size: 30 }, paragraph: { spacing: { after: 0, line: 360 } } } } },
    sections: [{ children: paragraphs.map(paragraph => new Paragraph({
      children: (paragraph.content ?? []).map(run => new TextRun({
        children: (run.text ?? '').split('\t').flatMap((part, index) => index ? [new Tab(), part] : [part]),
        bold: run.marks?.some(mark => mark.type === 'bold'),
        italics: run.marks?.some(mark => mark.type === 'italic'),
      })),
    })) }],
  })
  return { filename, blob: await Packer.toBlob(document) }
}

export function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  try { link.click() }
  finally {
    link.remove()
    // Allow the browser to consume the blob before releasing its URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
