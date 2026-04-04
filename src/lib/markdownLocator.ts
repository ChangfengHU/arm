/**
 * Markdown position locator for bi-directional sync
 * Maps rendered HTML elements back to their source positions in markdown
 */

export interface ElementLocation {
  start: number;
  end: number;
  type: 'heading' | 'paragraph' | 'list' | 'quote' | 'code' | 'table' | 'image' | 'hr';
}

/**
 * Find the position of an element in markdown text
 * @param text - The markdown text
 * @param elementType - Type of element to find
 * @param content - Text content or identifier of the element
 * @param index - Index of the element (for multiple similar elements)
 * @returns The position (start, end) or null
 */
export function findElementPosition(
  text: string,
  elementType: string,
  content: string,
  index: number = 0
): ElementLocation | null {
  switch (elementType) {
    case 'heading':
      return findHeading(text, content, index);
    case 'paragraph':
      return findParagraph(text, content, index);
    case 'list':
      return findListItem(text, content, index);
    case 'quote':
      return findBlockquote(text, content, index);
    case 'code':
      return findCodeBlock(text, index);
    case 'table':
      return findTable(text, index);
    case 'hr':
      return findHorizontalRule(text, index);
    default:
      return findParagraph(text, content, index);
  }
}

/**
 * Find heading position
 */
function findHeading(text: string, content: string, index: number): ElementLocation | null {
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;
  let match;
  let count = 0;

  while ((match = headingPattern.exec(text)) !== null) {
    // If content is provided and not empty, match by content
    if (content && match[2].trim().includes(content)) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        type: 'heading'
      };
    }
    // If no content provided, match by index
    if (!content && count === index) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        type: 'heading'
      };
    }
    count++;
  }

  return null;
}

/**
 * Find paragraph position
 */
function findParagraph(text: string, _content: string, index: number): ElementLocation | null {
  // Split by blank lines to find paragraphs
  const paragraphs = text.split(/\n\s*\n/);

  // Filter out non-paragraph elements
  const validParagraphs = paragraphs.filter(para => {
    const trimmed = para.trim();
    if (!trimmed) return false;
    // Skip block-level elements
    if (trimmed.startsWith('#')) return false;  // headings
    if (trimmed.startsWith('>')) return false;  // blockquotes
    if (trimmed.startsWith('```')) return false;  // code blocks
    if (trimmed.startsWith('|')) return false;  // tables
    if (trimmed.startsWith('---')) return false;  // horizontal rules
    if (trimmed.match(/^\s*[-*+]\s/)) return false;  // lists
    return true;
  });

  let foundCount = 0;
  let currentIndex = 0;

  for (const para of validParagraphs) {
    // Match by index when content is not provided
    if (foundCount === index) {
      // Find the exact position in the original text
      const startPos = text.indexOf(para, currentIndex);
      if (startPos !== -1) {
        return {
          start: startPos,
          end: startPos + para.length,
          type: 'paragraph'
        };
      }
    }

    // Update current index to search after this paragraph
    currentIndex = text.indexOf(para, currentIndex);
    if (currentIndex === -1) break;
    currentIndex += para.length;

    foundCount++;
  }

  return null;
}

/**
 * Find list item position
 */
function findListItem(text: string, content: string, index: number): ElementLocation | null {
  const lines = text.split('\n');
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^\s*[-*+]\s+/) || line.match(/^\s*\d+\.\s+/)) {
      if (line.includes(content) || count === index) {
        const startPos = text.indexOf(line, text.split('\n').slice(0, i).join('\n').length);
        if (startPos !== -1) {
          return {
            start: startPos,
            end: startPos + line.length,
            type: 'list'
          };
        }
      }
      count++;
    }
  }

  return null;
}

/**
 * Find blockquote position
 */
function findBlockquote(text: string, content: string, index: number): ElementLocation | null {
  const quotePattern = /^>\s*(.+)$/gm;
  let match;
  let count = 0;
  let startPos = -1;

  while ((match = quotePattern.exec(text)) !== null) {
    if (startPos === -1) startPos = match.index;

    if (match[1].includes(content) || count === index) {
      // Find the full quote block (multiple consecutive lines)
      let endPos = match.index + match[0].length;
      const remainingText = text.substring(endPos);
      const nextNewline = remainingText.search(/\n[^>]/);

      if (nextNewline !== -1) {
        endPos += nextNewline;
      }

      return {
        start: startPos,
        end: endPos,
        type: 'quote'
      };
    }
    count++;
  }

  return null;
}

/**
 * Find code block position
 */
function findCodeBlock(text: string, index: number): ElementLocation | null {
  const codePattern = /```(\w*)\n([\s\S]+?)\n```/g;
  let match;
  let count = 0;

  while ((match = codePattern.exec(text)) !== null) {
    if (count === index) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        type: 'code'
      };
    }
    count++;
  }

  return null;
}

/**
 * Find table position
 */
function findTable(text: string, index: number): ElementLocation | null {
  const tablePattern = /^(\|.+\|\r?\n)+/gm;
  let match;
  let count = 0;

  while ((match = tablePattern.exec(text)) !== null) {
    if (count === index) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        type: 'table'
      };
    }
    count++;
  }

  return null;
}

/**
 * Find horizontal rule position
 */
function findHorizontalRule(text: string, index: number): ElementLocation | null {
  const hrPattern = /^[-*_]{3,}\s*$/gm;
  let match;
  let count = 0;

  while ((match = hrPattern.exec(text)) !== null) {
    if (count === index) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        type: 'hr'
      };
    }
    count++;
  }

  return null;
}

/**
 * Select text in a textarea element and scroll into view
 */
export function selectTextAreaRange(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number
): void {
  textarea.focus();
  textarea.setSelectionRange(start, end);

  // Scroll the selection into view
  const textBefore = textarea.value.substring(0, start);
  const linesBefore = textBefore.split('\n').length;
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 28;
  const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop) || 0;

  const scrollPosition = (linesBefore - 1) * lineHeight - paddingTop + textarea.clientHeight / 2;
  textarea.scrollTop = Math.max(0, scrollPosition);
}
