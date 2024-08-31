import { Octokit } from "octokit";
import readlineSync from "readline-sync";
import fs from "fs-extra";
import simpleGit from "simple-git";
import sodium from "libsodium-wrappers";

async function main() {
  // Step 1: Remove existing .git folder
  await fs.remove(".git");
  console.log(".git folder removed.");

  // Step 2: Initialize a new Git repository
  const git = simpleGit();
  await git.init();
  console.log("Initialized a new git repository.");

  // Step 3: Gather GitHub Authentication Token
  const githubToken = readlineSync.question(
    "Enter your GitHub authentication token: ",
    {
      hideEchoBack: true,
    }
  );

  // Step 4: Initialize Octokit
  const octokit = new Octokit({
    auth: githubToken,
  });

  // Step 5: Check for existing GitHub repository
  const repoExists = readlineSync.keyInYN(
    "Do you have an existing GitHub repository? "
  );

  let repoName;
  let username;
  if (repoExists) {
    repoName = readlineSync.question(
      "Enter the name of the existing GitHub repository: "
    );
  } else {
    repoName = readlineSync.question(
      "Enter the name for the new GitHub repository: "
    );
    username = readlineSync.question("Enter your GitHub username: ");

    // Step 6: Create a new GitHub repository
    // await octokit.repos.createForAuthenticatedUser({
    //   name: repoName,
    //   private: true, // Set repository visibility
    // });
    // console.log(`Created a new GitHub repository: ${repoName}`);

    await octokit.request("POST /user/repos", {
      name: repoName,
      description: "Quickstart",
      homepage: "https://github.com",
      private: false,
      is_template: true,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  }

  // Step 7: Add remote and push to GitHub
  await git.addRemote(
    "origin",
    `https://github.com/${username}/${repoName}.git`
  );
  await git.add(".");
  await git.commit("Initial commit");
  await git.branch(["-M", "main"]);

  await git.push("origin", "main");
  console.log("Code pushed to GitHub.");

  // Step 8: Set up .env file
  const envVariables = [
    "DB_USER",
    "DB_PASSWORD",
    "DB_URL",
    "HASURA_ADMIN_SECRET",
    "AUTH0_ISSUER_BASE_URL",
    "AUTH0_BASE_URL",
    "AUTH0_CLIENT_SECRET",
    "AUTH0_CLIENT_ID",
    "AUTH0_SECRET",
  ];

  const values = [];

  let envContent = "";
  envVariables.forEach((variable) => {
    const value = readlineSync.question(`Enter value for ${variable}: `);
    values.push(value);
    envContent += `${variable}=${value}\n`;
  });

  fs.writeFileSync(".env", envContent);
  console.log(".env file created.");

  // Step 9: Add .env to .gitignore
  fs.appendFileSync(".gitignore", "\n.env");
  console.log(".env added to .gitignore.");

  // Step 10: Create GitHub secrets
  const repo = repoName;

  //Get repo key
  const keyResponse = await octokit.request(
    "GET /repos/{owner}/{repo}/actions/secrets/public-key",
    {
      owner: username,
      repo: repo,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  const key = keyResponse.data.key;
  const key_id = keyResponse.data.key_id;

  async function encryptSecret(secret) {
    try {
      // Wait for libsodium to be ready
      await sodium.ready;

      // Convert the secret and key to a Uint8Array
      const binkey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
      const binsec = sodium.from_string(secret);

      // Encrypt the secret using libsodium
      const encBytes = sodium.crypto_box_seal(binsec, binkey);

      // Convert the encrypted Uint8Array to Base64
      const output = sodium.to_base64(
        encBytes,
        sodium.base64_variants.ORIGINAL
      );

      // Print the output
      console.log(output);
      return output;
    } catch (error) {
      console.error("Error encrypting secret:", error);
    }
  }

  let i = 0;
  for (const variable of envVariables) {
    const encrypted_secret = encryptSecret(values[i]);
    await octokit.request(
      "PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}",
      {
        owner: username,
        repo: repo,
        secret_name: variable,
        encrypted_value: encrypted_secret,
        key_id: key_id,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    i = i + 1;
  }

  console.log("Project setup completed successfully.");
}

main().catch(console.error);
