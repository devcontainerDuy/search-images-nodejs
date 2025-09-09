async function index(req, res, next) {
    res.render("index", {
        meta: { title: "Image Gallery", description: "A simple image gallery application", keywords: "images, gallery, upload" },
        body: {
            title: "Image Gallery",
            description: "A simple image gallery application",
        },
    });
}

module.exports = { index };
