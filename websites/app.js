import "dotenv/config";
import express from "express";
import path from "node:path";
import createHttpError from "http-errors";
import cookieParser from "cookie-parser";
import logger from "morgan";
import indexRouter from "./routes/index.route.js";
import usersRouter from "./routes/users.route.js";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import limiter from "./config/limit.js";
import fs from "node:fs";

const app = express();

// view engine setup
app.set("views", path.join(process.cwd(), "views"));
app.set("view engine", "ejs");

// Security
app.use(helmet());
app.use(cors());

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(compression());
app.use(limiter);

const pub = path.join(process.cwd(), "public");
const up = path.join(pub, "uploads");
if (!fs.existsSync(up)) fs.mkdirSync(up, { recursive: true });
if (!fs.existsSync(path.join(up, "tmp"))) fs.mkdirSync(path.join(up, "tmp"), { recursive: true });
app.use(express.static(pub));

// Routes
app.use("/", indexRouter);
app.use("/users", usersRouter);

// catch 404 and forward to error handler
app.use((req, res, next) => {
    next(createHttpError(404));
});

// error handler
app.use((err, req, res, next) => {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get("env") === "development" ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render("error");
});

export default app;
