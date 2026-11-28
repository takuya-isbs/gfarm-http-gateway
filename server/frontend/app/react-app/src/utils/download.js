import { encodePath } from "@utils/func";
import { API_URL } from "@utils/config";

async function download(files, setError) {
    if (!files || files.length === 0) {
        setError("No file selected for download");
        return;
    }

    console.debug("download:", files);

    if (files.length === 1 && files[0].is_file) {
        const epath = encodePath(files[0].path);
        const dlurl = `${API_URL}/file${epath}?action=download`;
        const filename = files[0].path.split("/").pop();
        const a = document.createElement("a");
        a.href = dlurl;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            a.remove();
        }, 100);
    } else {
        const dlurl = `${API_URL}/zip`;
        const paths = files.map((file) => file.path);
        console.debug("paths", paths);

        const form = document.createElement("form");
        form.action = dlurl;
        form.method = "POST";
        form.style.display = "none";

        for (const path of paths) {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = "paths";
            input.value = path;
            form.appendChild(input);
        }

        document.body.appendChild(form);
        form.submit();

        setTimeout(() => {
            form.remove();
        }, 100);
    }
}

export default download;
