#!/usr/bin/env node

var execSync = require('child_process').execSync;
var fs = require('fs');
var path = require('path');
var gutil = require('gulp-util');
require('shelljs/global');

function getGitRootDirectory() {
  try {
    return execSync('git rev-parse --show-toplevel').toString().trim();
  } catch(e) {
    return undefined;
  }
}

function print(message, options) {
  if (message) {
    message = JSON.stringify(message);
    var color = options && options.color || 'white';
    gutil.log(gutil.colors[color](message));
  } else {
    gutil.log(gutil.colors.red('Warning! Trying to print an undefined message'));
  }
}

var exitCode = 0;
var gitRoot = getGitRootDirectory();

function execCommand(command, root) {
  try {
    // Fixes the issue the causes SourceTree to not run the pre-commit hook with the error:
    // 'env: node: No such file or directory'
    var cwd = process.cwd() || process.env.PWD;
    execSync(command, { cwd: cwd });
  } catch(e) {
    if (e && e.stdout) {
      print(e.stdout.toString(), {color: 'red'});
    }

    process.exit(1);
  }
}

if (!gitRoot) {
  print("Are you sure this is a git repository..? I'll stop for now..", {color: 'red'});
  process.exit(1);
} else {
  var packageJson = JSON.parse(fs.readFileSync(path.join(gitRoot, 'package.json')));

  // Checks if the command to run exists in the package.json file
  if (!packageJson.precommit) {
    print("You did not supply any code to run in the 'precommit' field in the package.json file", {color: 'red'});
  } else {
    var command;

    // Ensure that code that isn't part of the prospective commit isn't tested within your pre-commit script
    command = "git stash --quiet --keep-index --include-untracked";
    execCommand(command, gitRoot);

    var commandParts = packageJson.precommit.split(" ");

    // Gets the executable to run
    var exec = commandParts[0];

    // Leaves only the params in the array
    commandParts.splice(0, 1);

    // Why do we use spawn and not a regular shelljs?
    // We want to preserve the colors of the output, so until the feature will be implemented
    // in shelljs, we;ll use the spawn way:
    // https://github.com/shelljs/shelljs/issues/86
    var spawn = require('child_process').spawn;
    var cmd = spawn(exec, commandParts, {stdio: "inherit", cwd: gitRoot });

    cmd.on('exit', function(code) {
      if (code !== undefined && code !== null && code !== 0) {
        exitCode = 1;
      }

      command = "git reset --hard";
      execCommand(command, gitRoot);

      command = "git stash pop --quiet --index";
      execCommand(command, gitRoot);

      process.exit(exitCode);
    });
  }
}