/**
 * 前端文件解析工具
 *
 * 支持纯文本类文件（.txt/.md/.csv/.json/.log）的前端解析：
 * - 使用 File.text() 读取文件内容
 * - 超过 MAX_FILE_LENGTH 字符时截断，避免上下文过长
 *
 * 图片解析接口预留（parseImage），当前返回占位文本。
 */

/** 文本文件最大字符数，超出部分截断 */
export const MAX_FILE_LENGTH = 8000;

/** 支持解析的文本文件扩展名 */
const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".json", ".log"];

/** 支持解析的图片文件扩展名（当前仅占位，未实际解析） */
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

/** 解析后的文件结果 */
export interface ParsedFile {
  /** 文件名（含扩展名） */
  name: string;
  /** 文件类型分类：text | image | unsupported */
  type: "text" | "image" | "unsupported";
  /** 解析后的文本内容（图片与不支持的文件返回占位提示） */
  text: string;
}

/**
 * 获取文件扩展名（小写）
 */
function getExtension(file: File): string {
  const lastDot = file.name.lastIndexOf(".");
  if (lastDot === -1) return "";
  return file.name.slice(lastDot).toLowerCase();
}

/**
 * 解析文本文件：读取全文并截断至 MAX_FILE_LENGTH 字符
 *
 * @param file 文本文件对象
 * @returns 解析结果，text 字段为（可能截断的）文件内容
 */
async function parseTextFile(file: File): Promise<ParsedFile> {
  const raw = await file.text();
  // 超过最大长度时截断，并附加截断提示
  const truncated =
    raw.length > MAX_FILE_LENGTH
      ? `${raw.slice(0, MAX_FILE_LENGTH)}\n\n[文件内容已截断，原文共 ${raw.length} 字符]`
      : raw;
  return { name: file.name, type: "text", text: truncated };
}

/**
 * 解析图片文件（接口预留）
 *
 * 当前版本不支持图片解析，返回占位提示文本。
 * 未来可接入 OCR / 多模态模型实现实际解析。
 *
 * @param file 图片文件对象
 * @returns 占位解析结果
 */
async function parseImage(file: File): Promise<ParsedFile> {
  return {
    name: file.name,
    type: "image",
    text: `[图片文件，暂不支持解析] ${file.name}`,
  };
}

/**
 * 解析单个文件，根据扩展名自动分发到对应的解析器
 *
 * - 文本文件（.txt/.md/.csv/.json/.log）：读取内容并截断
 * - 图片文件（.png/.jpg/.jpeg/.gif/.webp）：返回占位提示
 * - 其他文件：返回不支持提示
 *
 * @param file 用户选择的文件对象
 * @returns 解析结果对象
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = getExtension(file);

  if (TEXT_EXTENSIONS.includes(ext)) {
    return parseTextFile(file);
  }

  if (IMAGE_EXTENSIONS.includes(ext)) {
    return parseImage(file);
  }

  // 不支持的文件类型
  return {
    name: file.name,
    type: "unsupported",
    text: `[不支持的文件类型] ${file.name}`,
  };
}
