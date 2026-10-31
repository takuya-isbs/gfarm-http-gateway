function encodePath(path) {
  let p = "/" + path.replace(/^\/+/, "").replace(/\/+$/, "");
  // URL encode without slash
  return p.replace(/[^/]/g, encodeURIComponent);
}

function removeLastSlash(text) {
  return text.replace(/\/+$/, "");
}

function basename(path) {
  return path.split("/").pop();
}

async function oauthInfoShow(tableElem, btnElem) {
  const tableContainer = document.getElementById(tableElem);
  const toggleButton = document.getElementById(btnElem);
  if (tableContainer) {
    const table = tableContainer.querySelector("table");
    if (table.style.display === "none") {
      table.style.display = "table";
      toggleButton.textContent = "Hide";
    } else {
      table.style.display = "none";
      toggleButton.textContent = "Show";
    }
  }
}

// not needed in newer browsers
// (SEE ALSO: gfarm_http_gateway.py:CHECK_CSRF)
const use_csrf_token = false;

async function my_fetch(url, options = {}) {
  if (!use_csrf_token) {
    return fetch(url, options);
  }
  const csrf_token = document.getElementById("csrf_token").value;
  const defaultHeaders = {
    "X-CSRF-Token": csrf_token,
  };
  const mergedHeaders = {
    ...defaultHeaders,
    ...(options.headers || {}),
  };
  const mergedOptions = {
    ...options,
    headers: mergedHeaders,
  };
  return fetch(url, mergedOptions);
}

// TODO simplify
async function whoami1() {
  const whoamiOut = document.getElementById("whoami_out1");
  try {
    const response = await fetch("./conf/me");
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const text = await response.text();
    whoamiOut.textContent = text;
  } catch (error) {
    console.error("Error fetching data:", error);
    whoamiOut.textContent = error;
  }
}

async function whoami2() {
  const whoamiURL = document.getElementById("whoami_url2").value;
  const whoamiOut = document.getElementById("whoami_out2");
  try {
    const response = await my_fetch("./access_token");
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const url = removeLastSlash(whoamiURL) + "/conf/me";
    const data = await response.json();
    const response2 = await fetch(url, {
      headers: {
        Authorization: "Bearer " + data.access_token,
      },
    });
    if (!response2.ok) {
      throw new Error(`HTTP error: ${response2.status}`);
    }
    const text = await response2.text();
    whoamiOut.textContent = text;
  } catch (error) {
    console.error("Error fetching data:", error);
    whoamiOut.textContent = error;
  }
}

async function whoami3() {
  const whoamiURL = document.getElementById("whoami_url3").value;
  const whoamiOut = document.getElementById("whoami_out3");
  try {
    const url = removeLastSlash(whoamiURL) + "/conf/me";
    const atElement = document.getElementById("access_token");
    const access_token = atElement.textContent;
    const response = await fetch(url, {
      headers: {
        Authorization: "Bearer " + access_token,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const text = await response.text();
    whoamiOut.textContent = text;
  } catch (error) {
    console.error("Error fetching data:", error);
    whoamiOut.textContent = error;
  }
}

// invalid Access token
async function whoamiWithoutAuth() {
  const whoamiURL = document.getElementById("whoami_url4").value;
  const whoamiOut = document.getElementById("whoami_out4");
  try {
    const url = removeLastSlash(whoamiURL) + "/conf/me";
    const response = await fetch(url, {
      headers: {
        Authorization: "Bearer " + "DUMMY",
      },
    });
    const text = await response.text();
    whoamiOut.textContent = text;
    //if (!response.ok) {
    //    throw new Error(`HTTP error: ${response.status}`);
    //}
  } catch (error) {
    console.error("Error:", error);
    whoamiOut.textContent = error;
  }
}

// ANONYMOUS
async function whoamiAnonymous() {
  const whoamiURL = document.getElementById("whoami_url5").value;
  const whoamiOut = document.getElementById("whoami_out5");
  try {
    const url = removeLastSlash(whoamiURL) + "/conf/me";
    const response = await fetch(url);
    const text = await response.text();
    whoamiOut.textContent = text;
  } catch (error) {
    console.error("Error:", error);
    whoamiOut.textContent = error;
  }
}

async function list() {
  const lsPath = document.getElementById("ls_path");
  const lsOut = document.getElementById("ls_out");
  const lsAll = document.getElementById("ls_all");
  const lsLong = document.getElementById("ls_long");
  const lsRecursive = document.getElementById("ls_recursive");
  const lsEffectivePerm = document.getElementById("ls_effperm");
  const lsIgnoreError = document.getElementById("ls_ign_err");
  const lsOutputFormat = document.getElementById("ls_output_format");
  const path = lsPath.value.replace(/^\/+/g, "");
  try {
    let api_dir = "./dir";
    let fullpath = api_dir + "/" + path;
    let params = new URLSearchParams();
    if (lsAll.checked) {
      params.append("show_hidden", 1);
    }
    if (lsLong.checked) {
      params.append("long_format", 1);
    }
    if (lsRecursive.checked) {
      params.append("recursive", 1);
    }
    if (lsEffectivePerm.checked) {
      params.append("effperm", 1);
    }
    if (lsIgnoreError.checked) {
      params.append("ign_err", 1);
    }
    params.append("output_format", lsOutputFormat.value);
    let params_str = params.toString();
    if (params_str) {
      fullpath = `${fullpath}?${params_str}`;
    }

    const response = await my_fetch(fullpath);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    //const data = await response.json();
    //lsOut.textContent = JSON.stringify(data, null, 2);
    const text = await response.text();
    lsOut.textContent = text;
  } catch (error) {
    console.error("Error fetching data:", error);
    lsOut.textContent = error;
  }
}

async function downloadFile() {
  const progressBar = document.getElementById("download-progress");
  const progressText = document.getElementById("download-progress-text");
  const cancelButton = document.getElementById("download-cancel");
  let path = document.getElementById("export_path").value;
  if (path) {
    let filename = basename(path);
    const epath = encodePath(path);
    const dlurl = `./file${epath}?action=download`;
    try {
      const startTime = Date.now();
      const xhr = new XMLHttpRequest();
      xhr.open("GET", dlurl);
      xhr.responseType = "blob";

      cancelButton.addEventListener("click", function () {
        progressText.textContent = "Canceled";
        xhr.abort();
      });

      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.floor((event.loaded / event.total) * 100);
          const elapsedTime = Date.now() - startTime; // msec.
          const speed = Math.round((event.loaded / elapsedTime) * 1000);
          const sec = Math.floor(elapsedTime / 1000);
          progressBar.value = percent;
          progressText.textContent = `${event.loaded} / ${event.total} | ${percent} % | ${sec} sec | ${speed} bytes/sec)`;
          console.log(
            "downloaded: %d / %d (%d %)",
            event.loaded,
            event.total,
            percent
          );
        }
      };

      xhr.onload = () => {
        const contentDisposition = xhr.getResponseHeader("Content-Disposition");
        if (contentDisposition) {
          // RFC 5987,8187
          let fnMatch = contentDisposition.match(/filename\*=UTF-8\'\'([^"]+)/);
          if (fnMatch) {
            downloadedFilename = decodeURIComponent(fnMatch[1]);
          } else {
            const fnMatch = contentDisposition.match(/filename="([^"]+)"/);
            if (fnMatch) {
              filename = decodeURIComponent(fnMatch[1]);
            }
          }
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          const blob = xhr.response;
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } else {
          progressText.textContent = `Error: HTTP ${xhr.status}: ${xhr.statusText}`;
          console.error(progressText.textContent);
        }
      };

      xhr.onerror = () => {
        progressText.textContent = "Network error";
        console.error("Network error");
      };

      xhr.send();
    } catch (error) {
      alert("Error: " + error.message);
      console.error(error);
    }
  } else {
    alert("Please input Gfarm path");
  }
}

// not used (fetch-then style)
// async function downloadFile2() {
//     let path = document.getElementById("export_path").value;
//     if (path) {
//         const epath = encodePath(path)
//         const requrl = `./file${epath}?action=download`;
//         fetch(requrl)
//             .then(response => {
//                 if (!response.ok) {
//                     return response.text().then(text => {
//                         throw new Error(`HTTP ${response.status}: ${text}`);
//                     });
//                 }
//                 const contentDisposition = response.headers.get('Content-Disposition');
//                 if (contentDisposition) {
//                     // RFC 5987,8187
//                     let fnMatch = contentDisposition.match(/filename\*=UTF-8\'\'([^"]+)/);
//                     if (fnMatch) {
//                         downloadedFilename = decodeURIComponent(fnMatch[1]);
//                     } else {
//                         const fnMatch = contentDisposition.match(/filename="([^"]+)"/);
//                         if (fnMatch) {
//                             filename = decodeURIComponent(fnMatch[1]);
//                         }
//                     }
//                 }
//                 return response.blob();
//             })
//             .then(blob => {
//                 const url = window.URL.createObjectURL(blob);
//                 const a = document.createElement('a');
//                 a.href = url;
//                 a.setAttribute('download', filename);
//                 a.style.display = 'none';
//                 document.body.appendChild(a);
//                 a.click();
//                 document.body.removeChild(a);
//                 window.URL.revokeObjectURL(url);
//             })
//             .catch(error => {
//                 alert("Error: " + error.message);
//                 console.error(error);
//             });
//     } else {
//         alert("Please input Gfarm path");
//     }
// }

async function displayFile() {
  let path = document.getElementById("export_path").value;
  if (path) {
    const epath = encodePath(path);
    const url = `./file${epath}`;
    window.open(url, "_blank");
  } else {
    alert("Please input Gfarm path");
  }
}

async function updateLink() {
  let pathElm = document.getElementById("export_path");
  const dlLink = document.getElementById("dl-link");
  const viewLink = document.getElementById("view-link");
  if (pathElm) {
    const path = pathElm.value;
    const epath = encodePath(path);
    const url = `./file${epath}`;
    let a = dlLink.querySelector("a");
    if (!a) {
      a = document.createElement("a");
      dlLink.appendChild(a);
    }
    a.href = url + "?action=download";
    a.textContent = `URL for download: ${a.href}`;

    let a2 = viewLink.querySelector("a");
    if (!a2) {
      a2 = document.createElement("a");
      viewLink.appendChild(a2);
    }
    a2.href = url + "?action=view";
    a2.textContent = `URL for view: ${a2.href}`;
  }
}

async function uploadFile() {
  const fileInput = document.getElementById("file_input");
  const cancelButton = document.getElementById("upload-cancel");
  const file = fileInput.files[0];
  const regDir = document.getElementById("reg_dir");
  const progressBar = document.getElementById("upload_progress");
  const progressText = document.getElementById("upload_progress_text");
  const status = document.getElementById("upload_status");
  const csrf_token = document.getElementById("csrf_token").value;
  let dirPath = "/" + regDir.value.replace(/^\/+/, "") + "/";
  dirPath = dirPath.replace(/\/+$/, "/");

  if (!file) {
    alert("Please select a file");
    return;
  }
  const uploadUrl = "./file" + dirPath + file.name;
  try {
    // (not work for large files)
    // const blob = await new Promise((resolve) => {
    //   const reader = new FileReader();
    //   reader.onprogress = (event) => {
    //     if (event.lengthComputable) {
    //       // const percent = (event.loaded / event.total) * 100;
    //       // progressBar.value = percent;
    //       // progressText.textContent = `${event.loaded} / ${event.total}`;
    //       console.log('reading: %d / %d', event.loaded, event.total);
    //     }
    //   };
    //   reader.onloadend = (event) => resolve(event.srcElement.result);
    //   reader.readAsArrayBuffer(file);
    // });

    const mtime = Math.floor(file.lastModified / 1000); // msec. -> sec.
    const startTime = Date.now();
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.responseType = "json";
    cancelButton.addEventListener("click", function () {
      status.textContent = "Canceled";
      xhr.abort();
    });
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("X-File-Timestamp", mtime);
    if (use_csrf_token) {
      xhr.setRequestHeader("X-CSRF-Token", csrf_token);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.floor((event.loaded / event.total) * 100);
        const elapsedTime = Date.now() - startTime; // msec.
        const speed = Math.round((event.loaded / elapsedTime) * 1000);
        const sec = Math.floor(elapsedTime / 1000);
        progressBar.value = percent;
        progressText.textContent = `${event.loaded} / ${event.total} | ${percent} % | ${sec} sec | ${speed} bytes/sec | (mtime=${mtime})`;
        console.log(
          "uploaded: %d / %d (%d %)",
          event.loaded,
          event.total,
          percent
        );
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        status.textContent = "Success (" + dirPath + file.name + ")";
        //alert('Upload: success (' + dirPath + file.name + ')');
        console.log("Upload: success");
      } else {
        //console.error(xhr.response);
        const stderr = JSON.stringify(xhr.response.detail.stderr);
        if (stderr === undefined) {
          status.textContent = `Error: HTTP ${xhr.status}: ${xhr.statusText}, detail=${xhr.response.detail}`;
        } else {
          status.textContent = `Error: HTTP ${xhr.status}: ${xhr.statusText}, stderr=${stderr}`;
        }
        console.error(status.textContent);
      }
    };
    xhr.onerror = () => {
      status.textContent = "Network error";
      console.error("Network error");
    };
    status.textContent = "Uploading...";
    //xhr.send(blob);
    xhr.send(file);
  } catch (error) {
    alert("Cannot upload:" + error);
    console.error("Cannot upload:", error);
    throw error;
  }
}

async function removeFile() {
  let path = document.getElementById("rm_path").value;
  const output = document.getElementById("rm_output");
  if (path) {
    const epath = encodePath(path);
    try {
      const url = `./file${epath}`;
      const response = await my_fetch(url, {
        method: "DELETE",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      output.textContent = "Success (removed)";
    } catch (error) {
      console.error(error);
      output.textContent = error;
    }
  } else {
    alert("Please input Gfarm path");
  }
}

async function dirCommon(pathId, outputId, method, message) {
  const path = document.getElementById(pathId).value;
  const output = document.getElementById(outputId);
  if (path) {
    const epath = encodePath(path);
    try {
      const url = `./dir${epath}`;
      const response = await my_fetch(url, {
        method: method,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      output.textContent = `Success (${message})`;
    } catch (error) {
      console.error(error);
      output.textContent = error;
    }
  } else {
    alert("Please input Gfarm path");
  }
}

async function createDir() {
  await dirCommon("mkdir_path", "mkdir_output", "PUT", "created");
}

async function removeDir() {
  await dirCommon("rmdir_path", "rmdir_output", "DELETE", "removed");
}

async function move() {
  const src = document.getElementById("mv_src").value;
  const dest = document.getElementById("mv_dest").value;
  const input = document.getElementById("mv_input");
  const output = document.getElementById("mv_output");
  if (src && dest) {
    const data = JSON.stringify(
      {
        source: src,
        destination: dest,
      },
      null,
      2
    );
    input.textContent = data;

    try {
      const url = `./move`;
      const response = await my_fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: data,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      output.textContent = `Success (moved)`;
    } catch (error) {
      console.error(error);
      output.textContent = error;
    }
  } else {
    alert("Please input Gfarm path");
  }
}

async function stat() {
  const path = document.getElementById("stat_path").value;
  const output = document.getElementById("stat_output");
  if (path) {
    let filename = basename(path);
    const epath = encodePath(path);
    const url = `./attr${epath}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      output.textContent = JSON.stringify(await response.json(), null, 2);
    } catch (error) {
      console.error(error);
      output.textContent = error;
    }
  } else {
    alert("Please input Gfarm path");
  }
}

async function chmod() {
  const path = document.getElementById("chmod_path").value;
  const mode = document.getElementById("chmod_mode").value;
  const input = document.getElementById("chmod_input");
  const output = document.getElementById("chmod_output");
  if (path) {
    let filename = basename(path);
    const epath = encodePath(path);
    const url = `./attr${epath}`;

    const data = JSON.stringify(
      {
        Mode: mode,
      },
      null,
      2
    );
    input.textContent = data;

    try {
      const response = await my_fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: data,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      output.textContent = `Success (mode updated)`;
    } catch (error) {
      console.error(error);
      output.textContent = error;
    }
  } else {
    alert("Please input Gfarm path");
  }
}

async function gfptar() {
  const cmd = document.getElementById("gfptar_cmd").value;
  const base = document.getElementById("gfptar_base").value;
  const src = document.getElementById("gfptar_src").value;
  const dest = document.getElementById("gfptar_dest").value;
  const input = document.getElementById("gfptar_input");
  const output = document.getElementById("gfptar_output");
  if (src && dest) {
    const data = JSON.stringify(
      {
        command: cmd,
        basedir: base,
        source: [src],
        outdir: dest,
        options: [],
      },
      null,
      2
    );
    input.textContent = data;

    try {
      const response = await fetch("./gfptar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: data,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        console.log("Received:", text);
        output.textContent = text;
        buffer += text;
      }
      console.log("result:", buffer);
    } catch (error) {
      alert("Error: " + error.message);
      console.error(error);
    }
  } else {
    alert("Please input Gfarm path");
  }
}
