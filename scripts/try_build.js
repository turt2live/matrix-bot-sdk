const fs = require("fs");
const child_process = require('child_process');

if (fs.existsSync("lib")) {
    console.log("Build output already present - skipping build");
    process.exit(0);
} else {
    console.log("No build output found - attempting build"); // attempt made in the npm preinstall hook
    child_process.execSync("npm run build", {
        env: process.env,
        stdio: ['inherit', 'inherit', 'inherit'],
    });
    process.exit(0);
}
