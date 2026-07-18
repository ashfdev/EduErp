import { Router } from "express";
import { slidersRouter } from "./sliders.routes";
import { noticesRouter } from "./notices.routes";
import { galleryRouter } from "./gallery.routes";
import { downloadsRouter } from "./downloads.routes";
import { pagesRouter } from "./pages.routes";
import { governingBodyRouter } from "./governing-body.routes";
import { eventsRouter } from "./events.routes";
import { contactRouter } from "./contact.routes";
import { importantLinksRouter } from "./important-links.routes";

export const websiteRouter = Router();

websiteRouter.use("/sliders", slidersRouter);
websiteRouter.use("/notices", noticesRouter);
websiteRouter.use("/gallery", galleryRouter);
websiteRouter.use("/downloads", downloadsRouter);
websiteRouter.use("/pages", pagesRouter);
websiteRouter.use("/governing-body", governingBodyRouter);
websiteRouter.use("/events", eventsRouter);
websiteRouter.use("/contact", contactRouter);
websiteRouter.use("/important-links", importantLinksRouter);
