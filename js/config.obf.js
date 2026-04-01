// Lightweight obfuscation wrapper for Drive config (renamed keys to be less searchable).
(function(g){
    const stash = [
        "cNUedF0Z3d2bVZWZ9cUWkt3dPJ1ZCVmXiByaLxmemx0T05Fb3RET",
        "rVDQb11XbpTXsZESF1TVh9lXFp0QMtWRO9FaX91R61FP",
        "=0zZ5EmR0RVahVWRV9GILhHTBx1QBFEVexGbd5jf00lf3VlSDJ1TkFGOpRDP",
        "",
        "0FEZSV2RHBmajBUNhtVQ7VXQ08ma8V2au5UY6I1amdGP",
        "3RlP98HVHpFPahFNaJUdu5nbf5WRutFI/5TY9UWZfZGP",
        "+hHXIVnU/tkY9kDeoJFZbpUQr5kaMp2R1QEZcl2R/8HP"
    ];

    const rev = (s) => s.split("").reverse().join("");
    const b64 = (s) => {
        if (typeof atob !== "undefined") return atob(s);
        if (typeof Buffer !== "undefined") return Buffer.from(s, "base64").toString("binary");
        return "";
    };
    const unx = (s) => {
        const raw = b64(rev(s));
        let out = "";
        for (let i = 0; i < raw.length; i++) out += String.fromCharCode(raw.charCodeAt(i) ^ 13);
        return out;
    };

    const bundle = {
        a0: unx(stash[0]),
        b1: unx(stash[1]),
        c2: unx(stash[2]),
        d3: unx(stash[3]),
        e4: unx(stash[4]),
        f5: unx(stash[5]),
        g6: unx(stash[6])
    };

    g.__OBF_PAL = function(){ return Object.assign({}, bundle); };
})(typeof window !== "undefined" ? window : globalThis);
