import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import "@omni-ir/elements";
import { AppComponent } from "./app.component";

bootstrapApplication(AppComponent, { providers: [provideZonelessChangeDetection()] }).catch((error) => console.error(error));
