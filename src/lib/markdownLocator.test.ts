import { describe, test, expect } from 'vitest';
import { findElementPosition } from './markdownLocator';

describe('findElementPosition', () => {
  const markdownText = `# 一级标题

这是第一段文字。

这是第二段文字。

## 二级标题

- 列表项 1
- 列表项 2

> 这是一段引用

\`\`\`javascript
const x = 1;
\`\`\`

![图片 · 14:30](data:image/png;base64,ABC123)

| 列1 | 列2 |
|-----|-----|
| A   | B   |

---

最后一段文字。`;

  test('找到第一个标题', () => {
    const result = findElementPosition(markdownText, 'heading', '一级标题', 0);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('heading');
  });

  test('找到第二个标题', () => {
    const result = findElementPosition(markdownText, 'heading', '二级标题', 0);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('heading');
  });

  test('找到段落', () => {
    const result = findElementPosition(markdownText, 'paragraph', '第一段', 0);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('paragraph');
  });

  test('找到列表', () => {
    const result = findElementPosition(markdownText, 'list', '列表项', 0);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('list');
  });

  test('找到引用', () => {
    const result = findElementPosition(markdownText, 'quote', '引用', 0);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('quote');
  });

  test('找到代码块', () => {
    const result = findElementPosition(markdownText, 'code', '', 0);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('code');
  });

  // Note: 图片定位使用专门的 findImagePosition 函数（在 imageSelector.ts 中）
  // 不再通过 findElementPosition 处理，所以这里不测试图片类型

  test('找到表格', () => {
    const result = findElementPosition(markdownText, 'table', '', 0);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('table');
  });

  test('找到分割线', () => {
    const result = findElementPosition(markdownText, 'hr', '', 0);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('hr');
  });

  test('通过索引找到第三个标题（不存在）', () => {
    const result = findElementPosition(markdownText, 'heading', '', 2);
    expect(result).toBeNull();
  });
});
