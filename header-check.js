/**
 * Copyright (c) 2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for better output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// SPDX identifier to check for license presence
const SPDX_IDENTIFIER = 'SPDX-License-Identifier: EPL-2.0';

// Directories and file extensions to check
const CHECK_PATHS = [
  { dir: 'src', exts: ['.ts'], type: 'typescript', description: 'TypeScript source files' },
  { dir: 'tests', exts: ['.ts'], type: 'typescript', description: 'TypeScript test files' },
  { dir: '.config', exts: ['.js'], type: 'typescript', description: 'Configuration files' },
  { dir: 'build', exts: ['.sh'], type: 'shell', description: 'Build scripts' },
  { dir: 'scripts', exts: ['.sh'], type: 'shell', description: 'Utility scripts' },
  {
    dir: '.github/workflows',
    exts: ['.yml', '.yaml'],
    type: 'yaml',
    description: 'GitHub Actions workflows',
  },
];

const IGNORE_DIRS = ['node_modules', 'dist', 'coverage', '.git', '.yarn'];
const IGNORE_FILES = ['.d.ts'];

const fix = process.argv.includes('--fix');
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

/**
 * Load license header from copyright.js
 */
function loadLicenseHeader() {
  const copyrightPath = path.join(__dirname, '.config', 'copyright.js');
  
  if (!fs.existsSync(copyrightPath)) {
    console.error(
      `${colors.red}❌ Error: copyright.js not found at ${copyrightPath}${colors.reset}`,
    );
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(copyrightPath, 'utf8');
    
    // Extract the comment block from copyright.js
    const commentMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
    if (!commentMatch) {
      console.error(
        `${colors.red}❌ Error: Could not find license header in copyright.js${colors.reset}`,
      );
      process.exit(1);
    }

    return commentMatch[0];
  } catch (error) {
    console.error(
      `${colors.red}❌ Error reading copyright.js: ${error.message}${colors.reset}`,
    );
    process.exit(1);
  }
}

/**
 * Convert TypeScript/JavaScript comment to shell/YAML comment format
 * Replaces block comments with hash comments
 */
function convertToShellFormat(licenseHeader) {
  // Remove /** and */ markers
  let content = licenseHeader.replace(/^\/\*\*/, '').replace(/\*\/$/, '');
  
  // Convert each line: remove leading ' * ' and add '#'
  const lines = content.split('\n');
  const convertedLines = lines.map(line => {
    // Remove leading whitespace and ' * ' or ' *'
    const cleaned = line.replace(/^\s*\*\s?/, '');
    if (cleaned === '') {
      return '#';
    }
    return `# ${cleaned}`;
  });

  return convertedLines.join('\n');
}

/**
 * Get license header for specific file type
 */
function getLicenseHeader(fileType) {
  const baseHeader = loadLicenseHeader();

  if (fileType === 'typescript') {
    return baseHeader;
  } else if (fileType === 'shell' || fileType === 'yaml') {
    return convertToShellFormat(baseHeader);
  }

  return baseHeader;
}

/**
 * Check if file has a valid license header
 */
function hasValidLicense(content) {
  return content.includes(SPDX_IDENTIFIER);
}

/**
 * Extract shebang from file content if present
 */
function extractShebang(content) {
  const shebangMatch = content.match(/^#!.*\n/);
  return shebangMatch ? shebangMatch[0] : null;
}

/**
 * Add license header to file content
 */
function addLicenseHeader(content, fileType) {
  const header = getLicenseHeader(fileType);

  if (!header) {
    console.warn(
      `${colors.yellow}⚠️  Could not generate license header for type: ${fileType}${colors.reset}`,
    );
    return null;
  }

  // Handle shell scripts with shebangs
  if (fileType === 'shell') {
    const shebang = extractShebang(content);
    if (shebang) {
      const contentWithoutShebang = content.replace(/^#!.*\n/, '');
      return shebang + header + '\n\n' + contentWithoutShebang;
    }
    return header + '\n\n' + content;
  }

  // Handle YAML files (workflows)
  if (fileType === 'yaml') {
    return header + '\n\n' + content;
  }

  // Handle TypeScript/JavaScript files
  return header + '\n\n' + content;
}

/**
 * Recursively find files in directory
 */
function findFiles(dir, extensions, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!IGNORE_DIRS.includes(file)) {
        findFiles(filePath, extensions, fileList);
      }
    } else {
      const ext = path.extname(file);
      const shouldIgnore = IGNORE_FILES.some(ignoreExt => file.endsWith(ignoreExt));

      if (extensions.includes(ext) && !shouldIgnore) {
        fileList.push(filePath);
      }
    }
  });

  return fileList;
}

/**
 * Check a single file for license header
 */
function checkFile(filePath, fileType) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    if (hasValidLicense(content)) {
      if (verbose) {
        console.log(`${colors.green}✓${colors.reset} ${filePath}`);
      }
      return { ok: true, fixed: false };
    }

    // Missing license header
    if (fix) {
      const newContent = addLicenseHeader(content, fileType);
      if (newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`${colors.green}✅ Added license header to:${colors.reset} ${filePath}`);
        return { ok: true, fixed: true };
      } else {
        console.error(`${colors.red}❌ Failed to fix:${colors.reset} ${filePath}`);
        return { ok: false, fixed: false };
      }
    } else {
      return { ok: false, fixed: false, file: filePath };
    }
  } catch (error) {
    console.error(
      `${colors.red}❌ Error reading file:${colors.reset} ${filePath}\n   ${error.message}`,
    );
    return { ok: false, fixed: false, error: true };
  }
}

/**
 * Main execution
 */
function main() {
  console.log(`${colors.cyan}════════════════════════════════════════════════════════${colors.reset}`);
  console.log(
    `${colors.cyan}    Eclipse Che License Header Check${colors.reset}${fix ? ` ${colors.yellow}(Fix Mode)${colors.reset}` : ''}`,
  );
  console.log(`${colors.cyan}════════════════════════════════════════════════════════${colors.reset}\n`);

  const stats = {
    total: 0,
    ok: 0,
    missing: [],
    fixed: 0,
    errors: 0,
  };

  // Process each path configuration
  CHECK_PATHS.forEach(({ dir, exts, type, description }) => {
    const files = findFiles(dir, exts);

    if (files.length === 0) {
      if (verbose) {
        console.log(`${colors.blue}ℹ${colors.reset}  No files found for: ${description} (${dir})`);
      }
      return;
    }

    if (verbose || fix) {
      console.log(`\n${colors.blue}Checking:${colors.reset} ${description} (${files.length} files)`);
    }

    files.forEach(file => {
      stats.total++;
      const result = checkFile(file, type);

      if (result.ok) {
        stats.ok++;
        if (result.fixed) {
          stats.fixed++;
        }
      } else if (result.error) {
        stats.errors++;
      } else {
        stats.missing.push(file);
      }
    });
  });

  // Print summary
  console.log(`\n${colors.cyan}════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}                      Summary${colors.reset}`);
  console.log(`${colors.cyan}════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`Total files checked:    ${stats.total}`);
  console.log(
    `Files with headers:     ${colors.green}${stats.ok}${colors.reset} ${stats.ok === stats.total ? '✓' : ''}`,
  );

  if (stats.fixed > 0) {
    console.log(`Files fixed:            ${colors.green}${stats.fixed}${colors.reset}`);
  }

  if (stats.missing.length > 0) {
    console.log(`Files missing headers:  ${colors.red}${stats.missing.length}${colors.reset}`);
  }

  if (stats.errors > 0) {
    console.log(`Files with errors:      ${colors.red}${stats.errors}${colors.reset}`);
  }

  console.log(`${colors.cyan}════════════════════════════════════════════════════════${colors.reset}\n`);

  // List missing files if not in fix mode
  if (stats.missing.length > 0 && !fix) {
    console.log(`${colors.red}Files missing license headers:${colors.reset}`);
    stats.missing.forEach(file => {
      console.log(`  ${colors.red}•${colors.reset} ${file}`);
    });
    console.log(
      `\n${colors.yellow}💡 Run "yarn header:fix" to automatically add license headers${colors.reset}\n`,
    );
  }

  // Exit with appropriate code
  if (stats.missing.length > 0 && !fix) {
    console.error(`${colors.red}❌ License header check failed${colors.reset}\n`);
    process.exit(1);
  } else if (stats.errors > 0) {
    console.error(`${colors.red}❌ License header check completed with errors${colors.reset}\n`);
    process.exit(1);
  } else if (fix && stats.fixed > 0) {
    console.log(
      `${colors.green}✅ All license headers have been fixed successfully!${colors.reset}\n`,
    );
    process.exit(0);
  } else {
    console.log(`${colors.green}✅ All files have proper license headers!${colors.reset}\n`);
    process.exit(0);
  }
}

// Run the script
main();
