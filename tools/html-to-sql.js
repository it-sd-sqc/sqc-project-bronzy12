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
  'ch12',
    
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
const extractTitle = function (root, id) {
  const title = root.querySelector(`#${id} .main`).text
  return title
}

const extractBody = function (root, id, pruneChildrenSelector) {
  const bodyNode = root.querySelector(`#${id} .divBody`)

  if (pruneChildrenSelector) {
    const children = bodyNode.querySelectorAll(pruneChildrenSelector)
    children.forEach((child) => {
      child.remove()
    })
  }

  // The <img> tags point to the wrong directory, so we
  // need to change them here.
  bodyNode.querySelectorAll('img').forEach(
    (image) => {
      const oldSrc = image.getAttribute('src')
      const oldSrcTokens = oldSrc.split('/')
      const newSrc = `/images/book/${oldSrcTokens[oldSrcTokens.length - 1]}`
      image.setAttribute('src', newSrc)
    }
  )

  // Return HTML with the line endings normalized to Unix.
  bodyNode.innerHTML = bodyNode.innerHTML.replaceAll('\r\n', '\n')
  bodyNode.innerHTML = bodyNode.innerHTML.trim()
  return bodyNode
}

const extractMoves = function (output, player, moveSrc) {
  // Remove newline.
  const withDots = moveSrc.trim()

  // Remove periods.
  const clean = withDots.replaceAll('.', '')

  const lines = clean.split(', ')
  let currentLetter

  // Skip the first token.
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].indexOf(' ') >= 0) {
      const tokens = lines[i].split(' ')
      currentLetter = tokens[0]
      output[currentLetter + tokens[1]] = player
    } else {
      // The line only contains a number.
      output[currentLetter + lines[i]] = player
    }
  }
}

const addSolution = function (problem, solutionSrc) {
  const result = Object.assign({}, problem.moves)
  const markers = {}
  const noNewline = solutionSrc.replaceAll('\r\n', '')
  const compact = noNewline.replaceAll(' ', '')

  let move = 1
  let who = problem.toPlay
  const moves = compact.split(',')
  moves.forEach((m) => {
    result[m] = who
    markers[m] = (move++).toString()
    who = (who === 'white') ? 'black' : 'white'
  })
  problem.solutions.push(serialize(gobanConfig, result, markers))
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

// Extract the problems…
const pRoot = domRoot.querySelector(`#${problemChapterId} .divBody`)

// First, extract the goals.
const goals = []
const goalNodes = pRoot.querySelectorAll('h3.main > span.sc')
goalNodes.forEach((node) => { goals.push(node.text) })
assert.equal(goals.length, 7, 'Expected seven goals.')

// Second, extract each problem group that corresponds to a goal…
const problemGroups = []

const groupNodes = pRoot.querySelectorAll('.div2 > .divBody')
const iTagRegExp = /<\/?i>/
let goalId = 1 // SQL ids start at 1.

// …and then extract the problems from that group.
groupNodes.forEach((node) => {
  const problems = []
  const descriptionNodes = node.querySelectorAll('p:not([class])')
  descriptionNodes.forEach((n) => {
    // All problem paragraphs have a single <br> tag.
    if (!n.querySelector('br')) return

    const number = n.querySelector('b').text
    const toPlay = n.querySelector('i').text.toLowerCase()
    const rows = n.innerHTML.replace(iTagRegExp, '')
    const lines = rows.split('<br>')
    const moves = {}
    extractMoves(moves, 'white', lines[0])
    extractMoves(moves, 'black', lines[1])
    const svg = serialize(gobanConfig, moves, {})
    problems.push({
      goalId,
      number,
      toPlay,
      moves,
      problem: svg,
      solutions: []
    })
  })
  // Skip the answer section.
  if (problems.length > 0) problemGroups.push(problems)
  goalId++
})
assert.equal(problemGroups.length, 7, 'Expected seven problem groups.')

// Finally, extract the solutions to each problem.
const ors = /,? or /g
const sRoots = pRoot.querySelectorAll('.div3')
let groupId = 0
sRoots.forEach((node) => {
  const solutionNodes = node.querySelectorAll('p')
  let problemId = 0
  solutionNodes.forEach((n) => {
    if (!problemGroups[groupId][problemId]) return

    const noPeriods = n.text.split('.')
    const solutions = noPeriods[1].split(ors)

    solutions.forEach((s) => {
      addSolution(problemGroups[groupId][problemId], s.trim())
    })
    problemId++
  })

  groupId++
})

// Extract problem chapter text after extracting the
// problems since we destructively alter the DOM.
chapters.push({
  title: extractTitle(domRoot, problemChapterId),
  body: extractBody(domRoot, problemChapterId, '.div2')
})

// Output the data as SQL.
const fd = openSync(dstPath, 'w')
writeFileSync(fd, sqlHeader)
writeFileSync(fd, `('${chapters[0].title}', '${chapters[0].body}')`)
chapters.slice(1).forEach((data) => {
  const value = `,\n('${data.title}', '${data.body}')`
  writeFileSync(fd, value)
})
writeFileSync(fd, ';\n\n')

// Output the problem types.
writeFileSync(fd, insertProblemTypesSql)
writeFileSync(fd, `  ('${goals[0]}')`)
goals.slice(1).forEach((data) => {
  const value = `,\n  ('${data}')`
  writeFileSync(fd, value)
})
writeFileSync(fd, ';\n\n')

// Output the problems.
problemGroups.forEach((problems) => {
  writeFileSync(fd, insertProblemsSql)
  writeFileSync(fd, `  (${problems[0].goalId}, '${problems[0].number}', '${problems[0].toPlay}', '${problems[0].problem}', '${problems[0].solutions.join('<p>OR</p>')}')`)
  problems.forEach((problem) => {
    writeFileSync(fd, `,\n  (${problem.goalId}, '${problem.number}', '${problem.toPlay}', '${problem.problem}', '${problem.solutions.join('<p>OR</p>')}')`)
  })
  writeFileSync(fd, ';\n\n')
})
closeSync(fd)
