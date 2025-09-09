async function index(req, res, next) {
    res.render("index", {
        meta: { title: "Image Gallery", description: "A simple image gallery application", keywords: "images, gallery, upload" },
        body: {
            title: "Image Gallery",
            description: "A simple image gallery application",
        },
    });
}

async function searchImages(req, res, next) {
    //
}

module.exports = { index, searchImages };
