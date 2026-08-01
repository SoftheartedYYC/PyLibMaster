/**
 * @file security.js
 * @description 安全工具函数
 * 
 * 职责：
 * - 提供路径安全校验功能
 * - 防止路径遍历攻击（Path Traversal）
 * - 确保用户只能访问指定的安全目录
 */

const path = require('path');

/**
 * 检查目标路径是否在允许的目录范围内
 * 
 * 安全机制：
 * - 解析为绝对路径后比较，防止 "../" 等相对路径绕过
 * - 确保目标路径是允许目录的子路径（包含边界检查）
 * 
 * @param {string} targetPath - 要检查的目标路径
 * @param {string[]} allowedDirs - 允许访问的目录列表
 * @returns {boolean} 路径是否安全（true=允许访问）
 * 
 * @example
 * isAllowedOpenPath('/home/user/docs/file.txt', ['/home/user/docs']); // true
 * isAllowedOpenPath('/etc/passwd', ['/home/user/docs']); // false
 */
function isAllowedOpenPath(targetPath, allowedDirs) {
  // 参数有效性检查
  if (typeof targetPath !== 'string' || !targetPath) return false;
  if (!Array.isArray(allowedDirs) || allowedDirs.length === 0) return false;

  // 解析为绝对路径，消除 ".." 等相对路径组件
  const resolved = path.resolve(targetPath);
  return allowedDirs.some((dir) => {
    const resolvedDir = path.resolve(dir);
    // 精确匹配目录本身，或匹配目录下的子路径（+ path.sep 避免前缀匹配误判）
    return resolved === resolvedDir || resolved.startsWith(resolvedDir + path.sep);
  });
}

module.exports = { isAllowedOpenPath };
