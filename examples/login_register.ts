import { MatrixAuth } from "../src";

// CAUTION: This logs a lot of secrets the console, including the password. Use with caution.

const homeserverUrl = "http://localhost:8008";
const password = "P@ssw0rd";
const username = `example_user_${new Date().getTime()}`;

const auth = new MatrixAuth(homeserverUrl);

auth.passwordRegister(username, password).then(client => {
    return client.getUserId();
}).then(userId => {
    console.log("Registered as " + userId + " - Trying to log in now");
    return auth.passwordLogin(username, password);
}).then(client => {
    return client.getUserId();
}).then(userId => {
    console.log("Logged in as " + userId);
}).catch(err => {
    console.error(err);
});
