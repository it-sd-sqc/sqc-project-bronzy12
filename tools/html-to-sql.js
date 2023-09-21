/***********************************************************
NOTE: If Git reports a fatal error saying either "LF will be
replaced by CRLF" or "CRLF would be replaced by LF", then
the line endings in the specified file (such as
"data/book.html") don't match your local Git repository.
You'll need to change the line endings in the specified file
to CRLF (carriage-return \r, line feed \n) or LF (line feed,
\n) in your text editor and resave the file.

This happens because Windows uses CRLF and macOS/Linux use
LF to indicate the end of the file, and Git doesn't want to
accidentally corrupt a binary file mislabelled as a text
file.
***********************************************************/

// Dependencies ////////////////////////////////////////////
import { strict as assert } from 'node:assert'
import { closeSync, openSync, readFileSync, writeFileSync }
  from 'node:fs'
import { parse } from 'node-html-parser'

// This module uses the CommonJS module format, so we need
// to import it differently.
import pkg from 'svgoban'
const { serialize } = pkg

// Configuration ///////////////////////////////////////////
const srcPath = 'data/SHHTML.html'
const dstPath = 'docs/generated-schema.sql'
const chapterIds = [
  'ch1',
  'ch2',
  'ch3',
  'ch4',
  'ch5',
  'ch6',
  'ch7',
  'ch8',
  'ch9',
  'ch10',
  'ch11',
  'ch12'
]


const sqlHeader = `DROP TABLE IF EXISTS chapters;
DROP TABLE IF EXISTS pages;

CREATE TABLE chapters (
  chapterName SERIAL PRIMARY KEY,
  chapterText TEXT NOT NULL
);

CREATE TABLE pages (
  pageNum SERIAL PRIMARY KEY
);

INSERT INTO chapters (chapterName, chapterText) VALUES
`

const insertPages = `INSERT INTO pages (pageNum) VALUES
`

const gobanConfig = {
  size: 19,
  theme: 'classic',
  coordSystem: 'A1',
  noMargin: false,
  hideMargin: false
}

// Utility functions ///////////////////////////////////////
const extractName = function (root, id) {
  const chapterName = root.querySelector(`#${id} .main`).text
  return title
}

const extractText = function (root, id, pruneChildrenSelector) {
  const bodyNode = root.querySelector(`#${id} .divBody`)

  if (pruneChildrenSelector) {
    const children = bodyNode.querySelectorAll(pruneChildrenSelector)
    children.forEach((child) => {
      child.remove()
    })
  }


  // Return HTML with the line endings normalized to Unix.
  bodyNode.innerHTML = bodyNode.innerHTML.replaceAll('\r\n', '\n')
  bodyNode.innerHTML = bodyNode.innerHTML.trim()
  return bodyNode
}


// Conversion //////////////////////////////////////////////
const src = readFileSync(srcPath, 'utf8')
const domRoot = parse(src)

// Remove pageNum nodes
const pageNums = domRoot.querySelectorAll('.pageNum')
pageNums.forEach(
  (element) => element.remove()
)

// Extract guide chapters.
const chapters = []

chapterIds.forEach(
  (id) => {
    // Extract the title
    const title = extractTitle(domRoot, id)
    const body = extractBody(domRoot, id)

    chapters.push({
      title,
      body
    })
  }
)


// Output the data as SQL.
const fd = openSync(dstPath, 'w')
writeFileSync(fd, sqlHeader)
writeFileSync(fd, `('${chapters[0].title}', '${chapters[0].body}')`)
chapters.slice(1).forEach((data) => {
  const value = `,\n('${data.title}', '${data.body}')`
  writeFileSync(fd, value)
})
writeFileSync(fd, ';\n\n')

closeSync(fd)
