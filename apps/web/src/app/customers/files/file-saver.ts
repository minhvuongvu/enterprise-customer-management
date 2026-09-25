import { DOCUMENT, inject, Injectable } from '@angular/core';
import { OBJECT_URLS } from '../../core/platform/platform.tokens';

/**
 * Hands a file the application already holds to the browser as a download.
 *
 * Two callers in this feature: the CSV export, and the error report the
 * import page builds from a partial import. Both have a `Blob` and a name;
 * this is the four lines that turn that into a download, written once.
 *
 * The object URL is revoked on the next task, not synchronously: some browsers
 * start the download asynchronously and abort it if the URL is gone. An
 * unrevoked URL would keep the whole file in memory for the life of the tab.
 *
 * Browser-only by nature. On the server there is no one to download to, so it
 * does nothing rather than failing.
 */
@Injectable({ providedIn: 'root' })
export class FileSaver {
  private readonly document = inject(DOCUMENT);
  private readonly urls = inject(OBJECT_URLS);

  save(blob: Blob, fileName: string): void {
    const url = this.urls.create(blob);
    if (!url) {
      return;
    }
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.click();
    setTimeout(() => this.urls.revoke(url));
  }
}
